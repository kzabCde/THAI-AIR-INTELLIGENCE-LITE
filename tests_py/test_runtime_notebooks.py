import ast
import json
from pathlib import Path

import pytest


NOTEBOOKS = (
    Path("training/train_dual_models_pm25.ipynb"),
    Path("training/train_all_6_models_pm25.ipynb"),
)


def _cell_source(notebook: dict, cell_id: str) -> str:
    for cell in notebook["cells"]:
        if cell.get("metadata", {}).get("id") == cell_id:
            return "".join(cell.get("source", []))
    raise AssertionError(f"missing notebook cell: {cell_id}")


@pytest.mark.parametrize("path", NOTEBOOKS)
def test_safe_notebooks_pin_v5_6_2_policy_and_have_no_stale_outputs(path):
    notebook = json.loads(path.read_text(encoding="utf-8"))
    configuration = _cell_source(notebook, "configuration")

    assert "MINIMUM_ROWS = 834" in configuration
    assert "CV_SPLITS = 5" in configuration
    assert "REGISTER = False" in configuration
    assert "ACTIVATE = False" in configuration

    for cell in notebook["cells"]:
        if cell.get("cell_type") != "code":
            continue
        assert cell.get("execution_count") is None
        assert cell.get("outputs") == []
        ast.parse("".join(cell.get("source", [])))
