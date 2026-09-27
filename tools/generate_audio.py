"""Generate German exercise MP3s locally. No API, account or network required.

One model load per run, content-addressed files, verified resumable cache.
Run using .venv-audio/Scripts/python.exe tools/generate_audio.py.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import importlib.metadata
import json
import math
import os
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VOICE = "de_DE-thorsten-high"
_worker_voice = None


def initialize_worker(model, threads):
    global _worker_voice
    _worker_voice = load_voice(model, threads)


def generate_one(text, path, metadata, length_scale):
    record = synthesize(_worker_voice, text, path, length_scale)
    write_json(metadata, record)
    return record


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def digest_file(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def extract_entries(deck):
    entries = []
    ids = set()
    for item in deck["items"]:
        groups = (("context", item.get("contexts", []), "answer"),
                  ("discrimination", item.get("discriminations", []), "correct"))
        for kind, exercises, answer_key in groups:
            for index, exercise in enumerate(exercises, 1):
                entry_id = exercise.get("id") or f"{item['id']}-{kind}-{index}"
                sentence, answer = exercise["sentence"], exercise[answer_key]
                if entry_id in ids:
                    raise ValueError(f"Duplicate exercise id: {entry_id}")
                if sentence.count("___") != 1 or not isinstance(answer, str) or not answer.strip():
                    raise ValueError(f"Invalid sentence/answer: {entry_id}")
                text = " ".join(sentence.replace("___", answer).split())
                if "___" in text:
                    raise ValueError(f"Unresolved gap: {entry_id}")
                ids.add(entry_id)
                entries.append(dict(id=entry_id, wordId=item["id"], kind=kind,
                                    text=text, translation=exercise.get("translation", "")))
    if not entries:
        raise ValueError("The deck contains no sentences")
    return entries


def audio_key(text, settings):
    payload = json.dumps([text, settings], ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


def cached_record(audio_path, metadata_path):
    try:
        record = read_json(metadata_path)
        if (audio_path.stat().st_size > 500 and record["durationSeconds"] > 0
                and record["sha256"] == digest_file(audio_path)):
            return record
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return None


def load_voice(model, threads):
    import onnxruntime as ort
    from piper import PiperVoice
    from piper.config import PiperConfig

    options = ort.SessionOptions()
    options.intra_op_num_threads = threads
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(model), sess_options=options,
                                   providers=["CPUExecutionProvider"])
    return PiperVoice(session=session, config=PiperConfig.from_dict(read_json(str(model) + ".json")))


def synthesize(voice, text, path, length_scale):
    import lameenc
    import numpy as np
    from piper import SynthesisConfig

    encoder = lameenc.Encoder()
    encoder.set_bit_rate(64)
    encoder.set_channels(1)
    encoder.set_in_sample_rate(voice.config.sample_rate)
    encoder.set_quality(2)
    encoder.silence()
    frames = 0
    square_sum = 0.0
    encoded = bytearray()
    config = SynthesisConfig(length_scale=length_scale, normalize_audio=True)
    for chunk in voice.synthesize(text, syn_config=config):
        if chunk.sample_channels != 1 or chunk.sample_width != 2:
            raise ValueError("Unexpected PCM format")
        samples = chunk.audio_int16_array.astype(np.float64)
        frames += samples.size
        square_sum += float(np.sum(samples * samples))
        encoded.extend(encoder.encode(chunk.audio_int16_bytes))
        # Preserve a short pause between separate sentences in a single exercise.
        pause_frames = int(chunk.sample_rate * 0.15)
        encoded.extend(encoder.encode(bytes(pause_frames * 2)))
        frames += pause_frames
    encoded.extend(encoder.flush())
    duration = frames / voice.config.sample_rate
    rms = math.sqrt(square_sum / max(frames, 1))
    if duration < 0.25 or duration > 90 or rms < 10 or len(encoded) < 500:
        raise ValueError(f"Invalid audio: duration={duration:.2f}s, rms={rms:.2f}")
    temporary = path.with_suffix(".mp3.part")
    temporary.write_bytes(encoded)
    temporary.replace(path)
    return dict(durationSeconds=round(duration, 3), bytes=len(encoded),
                rms=round(rms, 2), sha256=digest_file(path))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deck", type=Path, default=ROOT / "assets/assets/deck/A1.json")
    parser.add_argument("--model", type=Path, default=ROOT / f".audio-models/{VOICE}.onnx")
    parser.add_argument("--output", type=Path, default=ROOT / "audio/de-DE")
    parser.add_argument("--limit", type=int, default=0, help="Generate only the first N unique texts (sample)")
    parser.add_argument("--length-scale", type=float, default=1.08, help="1.08 is slightly slower than the voice default")
    parser.add_argument("--threads", type=int, default=1)
    parser.add_argument("--workers", type=int, default=min(4, max(1, (os.cpu_count() or 2) // 2)))
    parser.add_argument("--verify-only", action="store_true", help="Verify every expected file; do not synthesize")
    args = parser.parse_args()
    if args.limit < 0 or args.threads < 1 or args.workers < 1 or not 0.5 <= args.length_scale <= 2:
        parser.error("Invalid limit, threads or length scale")
    entries = extract_entries(read_json(args.deck))
    settings = dict(engine="piper", voice=args.model.stem, language="de-DE",
                    modelSha256=digest_file(args.model), configSha256=digest_file(Path(str(args.model) + ".json")),
                    piperVersion=importlib.metadata.version("piper-tts"),
                    encoderVersion=importlib.metadata.version("lameenc"),
                    lengthScale=args.length_scale, bitrateKbps=64, pauseSeconds=0.15,
                    pipelineVersion=1)
    unique = {}
    for entry in entries:
        key = audio_key(entry["text"], settings)
        entry["file"] = key + ".mp3"
        unique.setdefault(key, entry["text"])
    if args.limit:
        unique = dict(list(unique.items())[:args.limit])
        entries = [entry for entry in entries if entry["file"][:-4] in unique]
    args.output.mkdir(parents=True, exist_ok=True)
    cache = ROOT / ".audio-cache"
    records, failures = {}, []
    generated = reused = 0
    started = time.monotonic()
    pending = []
    for index, (key, text) in enumerate(unique.items(), 1):
        path = args.output / (key + ".mp3")
        metadata = cache / (key + ".json")
        record = cached_record(path, metadata)
        if record:
            reused += 1
        elif args.verify_only:
            failures.append(dict(file=path.name, error="Missing or invalid audio/cache"))
        else:
            pending.append((text, path, metadata, args.length_scale))
        if record:
            records[path.name] = record
    print(f"Verified cache: {reused}/{len(unique)}; generating {len(pending)} with {args.workers} workers", flush=True)
    if pending:
        with concurrent.futures.ProcessPoolExecutor(
                max_workers=args.workers, initializer=initialize_worker,
                initargs=(args.model, args.threads)) as executor:
            futures = {executor.submit(generate_one, *job): job for job in pending}
            try:
                for future in concurrent.futures.as_completed(futures):
                    text, path, _, _ = futures[future]
                    try:
                        records[path.name] = future.result()
                        generated += 1
                    except Exception as exc:
                        failures.append(dict(file=path.name, text=text, error=str(exc)))
                        print(f"FAILED {path.name}: {exc}", flush=True)
                    completed = reused + generated + len(failures)
                    if generated == 1 or completed % 25 == 0 or completed == len(unique):
                        print(f"{completed}/{len(unique)} | generated={generated} reused={reused} "
                              f"failed={len(failures)} | {time.monotonic() - started:.1f}s", flush=True)
            except KeyboardInterrupt:
                for future in futures:
                    future.cancel()
                print("Stopped. Completed files are saved; run again to resume.", flush=True)
                raise
    manifest = dict(version=1, settings=settings, complete=not failures and not args.limit,
                    scope="Full sentences with canonical answers; alternative accepted answers are not included",
                    entries=entries, files=records, failures=failures,
                    summary=dict(exercises=len(entries), uniqueTexts=len(unique), ready=len(records),
                                 durationSeconds=round(sum(r["durationSeconds"] for r in records.values()), 3),
                                 bytes=sum(r["bytes"] for r in records.values())))
    # Sample runs must never replace the full manifest.
    target = "manifest.sample.json" if args.limit else "manifest.json"
    if not args.verify_only:
        write_json(args.output / target, manifest)
    print(json.dumps(manifest["summary"]), flush=True)
    if failures:
        raise SystemExit(f"{len(failures)} files failed. Run again to resume.")


if __name__ == "__main__":
    main()
