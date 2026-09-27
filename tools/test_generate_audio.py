import json
import tempfile
import unittest
from pathlib import Path

from generate_audio import audio_key, cached_record, digest_file, extract_entries
from install_site_audio import HOOKS, patch_bundle


class AudioPipelineTests(unittest.TestCase):
    def test_build_hook_install_is_idempotent_and_checks_unknown_builds(self):
        source = '\n'.join(HOOKS)
        patched = patch_bundle(source)
        self.assertEqual(patch_bundle(patched), patched)
        with self.assertRaises(ValueError):
            patch_bundle('unrelated or newer Flutter build')

    def deck(self, answer="Männer"):
        return {"items": [{"id": "mann", "contexts": [{"id": "mann-1", "sentence": "Die ___ sind hier.", "answer": answer}],
                           "discriminations": [{"sentence": "Der ___ ist hier.", "correct": "Mann"}]}]}

    def test_full_sentence_preserves_umlauts_and_correct_answer(self):
        entries = extract_entries(self.deck())
        self.assertEqual(entries[0]["text"], "Die Männer sind hier.")
        self.assertEqual(entries[1]["text"], "Der Mann ist hier.")
        self.assertEqual(entries[1]["id"], "mann-discrimination-1")

    def test_ambiguous_gaps_and_duplicate_ids_fail(self):
        deck = self.deck()
        deck["items"][0]["contexts"][0]["sentence"] = "___ und ___."
        with self.assertRaises(ValueError):
            extract_entries(deck)
        deck = self.deck()
        deck["items"].append(deck["items"][0])
        with self.assertRaises(ValueError):
            extract_entries(deck)

    def test_changed_text_or_voice_settings_invalidates_audio_key(self):
        key = audio_key("Hallo", {"voice": "a", "speed": 1})
        self.assertEqual(key, audio_key("Hallo", {"speed": 1, "voice": "a"}))
        self.assertNotEqual(key, audio_key("Guten Tag", {"voice": "a", "speed": 1}))
        self.assertNotEqual(key, audio_key("Hallo", {"voice": "b", "speed": 1}))

    def test_corrupt_or_interrupted_output_is_not_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            audio, metadata = Path(directory) / "a.mp3", Path(directory) / "a.json"
            self.assertIsNone(cached_record(audio, metadata))
            audio.write_bytes(b"a" * 1000)
            record = {"durationSeconds": 2, "sha256": digest_file(audio)}
            metadata.write_text(json.dumps(record))
            self.assertEqual(cached_record(audio, metadata), record)
            audio.write_bytes(b"b" * 1000)
            self.assertIsNone(cached_record(audio, metadata))


if __name__ == "__main__":
    unittest.main()
