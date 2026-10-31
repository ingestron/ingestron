"""Renders SQL templates with python-liquid, for the template parity check.

Reads [{"template": ..., "data": ...}, ...] as JSON on stdin and writes the
rendered texts as a JSON list on stdout. Run with an interpreter that has
python-liquid installed; see scripts/check-template-parity.ts.
"""

import json
import sys

from liquid import Environment, FileSystemLoader

environment = Environment(loader=FileSystemLoader(sys.argv[1], ext=".liquid"))
files = json.load(sys.stdin)
json.dump([environment.get_template(item["template"]).render(**item["data"]).rstrip() + "\n" for item in files], sys.stdout)
