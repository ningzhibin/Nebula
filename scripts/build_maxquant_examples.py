#!/usr/bin/env python3
"""Embed MaxQuant example TSV files as lazy-load JS (same pattern as example_diann_pg_matrix.js)."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS_DIR = ROOT / "js"

SPECS = [
    {
        "src": ROOT / "proteinGroups.txt",
        "dst": JS_DIR / "example_maxquant_protein_groups.js",
        "json_var": "exampleMaxQuantProteinGroupsJson",
        "text_var": "exampleMaxQuantProteinGroupsText",
        "cache_var": "_maxQuantPgTsvCache",
        "comment": "MaxQuant proteinGroups.txt example embedded as JSON.",
    },
    {
        "src": ROOT / "Phospho (STY)Sites.txt",
        "dst": JS_DIR / "example_maxquant_phospho_sites.js",
        "json_var": "exampleMaxQuantPhosphoSitesJson",
        "text_var": "exampleMaxQuantPhosphoSitesText",
        "cache_var": "_maxQuantSitesTsvCache",
        "comment": "MaxQuant Phospho (STY)Sites.txt example embedded as JSON.",
    },
]


def tsv_to_json(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    while lines and not lines[-1].strip():
        lines.pop()
    if not lines:
        raise ValueError(f"{path.name} is empty")
    delimiter = "\t" if "\t" in lines[0] else ","
    headers = lines[0].split(delimiter)
    rows = [line.split(delimiter) for line in lines[1:] if line.strip()]
    return {"headers": headers, "rows": rows}


def write_js(spec: dict, data: dict) -> None:
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    js = f"""// {spec["comment"]}
// Auto-generated from {spec["src"].name} — do not edit by hand.
(function () {{
    window.{spec["json_var"]} = {payload};

    if (!Object.getOwnPropertyDescriptor(window, "{spec["text_var"]}")) {{
        Object.defineProperty(window, "{spec["text_var"]}", {{
            get: function () {{
                if (!window.{spec["cache_var"]}) {{
                    var d = window.{spec["json_var"]};
                    window.{spec["cache_var"]} = d.headers.join("\\t") + "\\n"
                        + d.rows.map(function (r) {{ return r.join("\\t"); }}).join("\\n");
                }}
                return window.{spec["cache_var"]};
            }}
        }});
    }}
}})();
"""
    spec["dst"].write_text(js, encoding="utf-8")
    print(f"Wrote {spec['dst']} ({spec['dst'].stat().st_size:,} bytes, {len(data['rows'])} rows)")


def main() -> None:
    JS_DIR.mkdir(parents=True, exist_ok=True)
    for spec in SPECS:
        if not spec["src"].is_file():
            raise FileNotFoundError(f"Missing source: {spec['src']}")
        write_js(spec, tsv_to_json(spec["src"]))


if __name__ == "__main__":
    main()
