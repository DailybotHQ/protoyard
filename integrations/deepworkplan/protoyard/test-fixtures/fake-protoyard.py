#!/usr/bin/env python3
import json
import os
import sys

if sys.argv[1:] != ['--version', '--json']:
    sys.exit(64)

with open(os.environ['PROTOYARD_FIXTURE_OUTPUT'], encoding='utf-8') as source:
    sys.stdout.write(source.read())

with open(os.environ['PROTOYARD_DETECT_ARGS'], 'w', encoding='utf-8') as target:
    json.dump(sys.argv[1:], target)
