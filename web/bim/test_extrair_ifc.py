"""Smoke test the extractor against public IFC models from multiple schema versions."""
import math
import os
from pathlib import Path
import unittest

from extrair_ifc import extract


class PublicIfcSamples(unittest.TestCase):
    def test_supported_schemas_and_finite_quantities(self):
        directory = Path(os.environ["IFC_FIXTURE_DIR"])
        for filename, expected_schema in (
            ("duplex-2x3.ifc", "IFC2X3"),
            ("architecture-4.ifc", "IFC4"),
            ("architecture-4x3.ifc", "IFC4X3"),
        ):
            with self.subTest(filename=filename):
                result = extract(directory / filename)
                self.assertEqual(result["schema"], expected_schema)
                self.assertGreater(len(result["elementos"]), 0)
                for element in result["elementos"]:
                    self.assertTrue(element["classe"].startswith("Ifc"))
                    for quantity in element["quantidades"]:
                        value = quantity["valor"]
                        self.assertTrue(value is None or math.isfinite(value))


if __name__ == "__main__":
    unittest.main()
