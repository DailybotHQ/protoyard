"""Exercise the vendored add-on detector and sync planner in a temp repo."""
import json
import os
import pathlib
import shutil
import stat
import sys
import tempfile

# Never write __pycache__ into the vendored DWP pack the probe imports from.
sys.dont_write_bytecode = True
sys.path.insert(0, sys.argv[1])
import addon_sync
import config
import resources

fixture_dir = pathlib.Path(sys.argv[3])
descriptor = json.load(sys.stdin)

with tempfile.TemporaryDirectory(prefix='protoyard-addon-sync-') as temporary:
    base = pathlib.Path(temporary)
    pack = base / 'pack'
    addons = pack / 'addons'
    addon_dir = addons / 'protoyard'
    addon_dir.mkdir(parents=True)
    (addon_dir / 'addon.json').write_text(json.dumps(descriptor), encoding='utf-8')
    (pack / 'SKILL.md').write_text('version: 7.8.1\n', encoding='utf-8')
    addon_sync.PACK_ROOT = str(pack)
    config.ADDONS_DIR = str(addons)
    original_load_descriptor = config.load_descriptor
    config.load_descriptor = lambda key, addons_dir=None: original_load_descriptor(
        key, addons_dir or str(addons)
    )
    config.addon_keys = lambda addons_dir=None: ['protoyard']

    repo = base / 'repo'
    dwp = repo / '.dwp'
    vendored = repo / '.agents' / 'skills' / 'deepworkplan'
    dwp.mkdir(parents=True)
    vendored.mkdir(parents=True)
    (vendored / 'SKILL.md').write_text('version: 7.8.1\n', encoding='utf-8')
    config_path = dwp / 'config.json'
    config_path.write_text(
        json.dumps({'addons': {'protoyard': {'enabled': True, 'version': 'v1.1.0'}}}),
        encoding='utf-8',
    )
    original_config = config_path.read_bytes()

    def inventory():
        return sorted(
            ('dir:' if path.is_dir() else 'file:') + str(path.relative_to(repo))
            for path in repo.rglob('*')
            if path.is_dir() or path.is_file()
        )

    original_files = inventory()
    fake_bin = base / 'bin'
    empty_bin = base / 'empty-bin'
    fake_bin.mkdir()
    empty_bin.mkdir()
    invocation_path = base / 'detect-argv.json'
    executable = fake_bin / 'protoyard'
    shutil.copyfile(fixture_dir / 'fake-protoyard.py', executable)
    executable.chmod(executable.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    python_bin = os.path.dirname(shutil.which('python3'))
    cases = [
        ('compatible', 'interface-1.json', True, 1, True, 'current'),
        ('missing', None, False, None, False, 'install'),
        ('missing-interface', 'interface-missing.json', True, None, False, 'verify'),
        ('malformed', 'malformed-output.txt', True, None, False, 'verify'),
        ('mismatched', 'interface-9.json', True, 9, False, 'verify'),
    ]
    results = []
    for label, fixture, detected, interface, compatible, action in cases:
        if fixture is None:
            os.environ['PATH'] = str(empty_bin)
            os.environ.pop('PROTOYARD_FIXTURE_OUTPUT', None)
        else:
            os.environ['PATH'] = str(fake_bin) + os.pathsep + python_bin
            os.environ['PROTOYARD_FIXTURE_OUTPUT'] = str(fixture_dir / fixture)
            os.environ['PROTOYARD_DETECT_ARGS'] = str(invocation_path)
        status = resources.addon_status('protoyard', str(repo))
        plan = addon_sync.build_plan(str(repo), ['protoyard'])
        row = plan['rows'][0]
        assert plan['schema'] == 'dwp-addon-sync/v1', plan
        assert status['descriptor_ok'] is True, status
        assert status['detected'] is detected, status
        assert status['interface'] == interface, status
        assert status['compatible'] is compatible, status
        assert row['action'] == action, row
        results.append({'case': label, 'action': row['action'], 'reason': status['reason']})
        if fixture is not None:
            args = json.loads(invocation_path.read_text(encoding='utf-8'))
            assert args == ['--version', '--json'], args
        assert config_path.read_bytes() == original_config
        assert inventory() == original_files
    assert 'interface unreadable' in results[2]['reason']
    assert 'interface unreadable' in results[3]['reason']
    assert 'unknown interface major 9' in results[4]['reason']
    print(json.dumps(results))
