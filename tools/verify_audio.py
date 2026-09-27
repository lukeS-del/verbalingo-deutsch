"""Decode every manifest MP3 and check exercise coverage, hashes and signal."""
import math
from pathlib import Path

import miniaudio
import numpy as np

from generate_audio import ROOT, digest_file, extract_entries, read_json, write_json


def main():
    directory = ROOT / "audio/de-DE"
    manifest = read_json(directory / "manifest.json")
    expected = extract_entries(read_json(ROOT / "assets/assets/deck/A1.json"))
    expected_by_id = {entry["id"]: entry["text"] for entry in expected}
    actual_by_id = {entry["id"]: entry["text"] for entry in manifest["entries"]}
    if not manifest["complete"] or actual_by_id != expected_by_id:
        raise SystemExit("The manifest is incomplete or out of date")
    files = manifest["files"]
    if {entry["file"] for entry in manifest["entries"]} != set(files):
        raise SystemExit("Manifest references missing or unexpected files")
    failures, warnings = [], []
    decoded_seconds = 0
    for index, (name, record) in enumerate(files.items(), 1):
        path = directory / name
        try:
            if path.name != name or path.suffix != ".mp3":
                raise ValueError("Invalid audio filename")
            if digest_file(path) != record["sha256"]:
                raise ValueError("Checksum mismatch")
            info = miniaudio.mp3_get_file_info(str(path))
            if info.nchannels != 1:
                raise ValueError("Expected mono MP3")
            audio = miniaudio.decode_file(str(path), nchannels=1, sample_rate=info.sample_rate)
            duration = audio.num_frames / info.sample_rate
            samples = np.asarray(audio.samples, dtype=np.float64)
            rms = math.sqrt(float(np.mean(samples * samples))) if samples.size else 0
            if rms < 10 or duration < 0.25:
                raise ValueError("Empty or silent audio")
            if abs(duration - record["durationSeconds"]) > 0.2:
                raise ValueError(f"Unexpected decoded duration: {duration:.3f}s")
            decoded_seconds += duration
            if np.count_nonzero(np.abs(samples) >= 32767) / samples.size > 0.001:
                warnings.append(dict(file=name, issue="More than 0.1% of decoded samples reach full scale; listen for clipping"))
        except Exception as exc:
            failures.append(dict(file=name, error=str(exc)))
        if index % 250 == 0 or index == len(files):
            print(f"Decoded {index}/{len(files)}; failures={len(failures)}", flush=True)
    report = dict(exercises=len(expected), files=len(files), decodedSeconds=round(decoded_seconds, 3),
                  bytes=sum(record["bytes"] for record in files.values()), failures=failures, warnings=warnings,
                  passed=not failures, note="Technical validation only; pronunciation has not been reviewed by a human.")
    write_json(ROOT / "audio-preparation/verification.json", report)
    print(f"Passed={report['passed']}, warnings={len(warnings)}, minutes={decoded_seconds / 60:.1f}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
