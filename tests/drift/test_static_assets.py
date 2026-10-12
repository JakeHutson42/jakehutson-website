"""Keep runtime libraries local and ensure the deployment export includes them."""
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("validate_static_assets", ROOT / "scripts/validate_static_assets.py")
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class StaticAssetsTests(unittest.TestCase):
    def test_browser_dependencies_are_local_and_present(self):
        count, errors = validator.validate_site(ROOT)
        self.assertGreater(count, 100)
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
