#!/usr/bin/env python3
"""Offline and live checks for the narrowly patched upmpdcli Qobuz plugin.

The behavioral checks use fake API/config objects and never contact Qobuz.
The optional live checks inspect only source syntax, service umask, and file
metadata; they never read the Qobuz cache contents.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
from pathlib import Path
import subprocess
import types


def parse(path: Path) -> ast.Module:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    forbidden = (
        "msgproc.log(f\"trackuri: [{a}]\")",
        'msgproc.log(f"OAuth: got auth_code: {auth_code}")',
        'uplog(f"session: init_oauth: auth_code {auth_code}")',
        'debug(f"login_with_oauth_code: got user token {self.user_auth_token}")',
    )
    for marker in forbidden:
        assert marker not in source, f"sensitive logging remains in {path}: {marker}"
    return tree


def function(tree: ast.Module, name: str) -> ast.FunctionDef:
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    raise AssertionError(f"function not found: {name}")


class Log:
    def __init__(self) -> None:
        self.messages: list[str] = []

    def __call__(self, message: str, *args: object, **kwargs: object) -> None:
        self.messages.append(str(message))


class OAuthSession:
    def __init__(self, result: object) -> None:
        self.result = result
        self.codes: list[str] = []

    def init_oauth(self, code: str) -> object:
        self.codes.append(code)
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result


def callback_behavior(app_path: Path) -> None:
    tree = parse(app_path)
    response_node = function(tree, "oauth_response")
    track_node = function(tree, "trackuri")
    track_node.decorator_list = []
    logger = Log()
    namespace: dict[str, object] = {
        "json": json,
        "msgproc": types.SimpleNamespace(log=logger),
        "maybelogin": lambda: None,
        "oauth_response": None,
    }
    exec(compile(ast.Module([response_node], []), str(app_path), "exec"), namespace)
    namespace["oauth_response"] = namespace["oauth_response"]
    exec(compile(ast.Module([track_node], []), str(app_path), "exec"), namespace)
    callback = namespace["trackuri"]

    for result, expected in ((True, "successful"), (False, "failed"), (RuntimeError("x"), "failed")):
        logger.messages.clear()
        session = OAuthSession(result)
        namespace["session"] = session
        page = callback({
            "path": "/qobuz/oauth/",
            "query": json.dumps({"code": "TEST-AUTH-CODE"}),
        })
        media_url = page["media_url"]
        assert expected in media_url, (result, media_url)
        assert "TEST-AUTH-CODE" not in "\n".join(logger.messages)
        assert "TEST-AUTH-CODE" not in media_url
        assert session.codes == ["TEST-AUTH-CODE"]

    logger.messages.clear()
    namespace["session"] = OAuthSession(True)
    page = callback({"path": "/qobuz/oauth/"})
    assert "failed" in page["media_url"]
    assert "TEST-AUTH-CODE" not in "\n".join(logger.messages)


class Config:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    def set(self, name: str, value: str) -> None:
        self.values[name] = value


class API:
    def __init__(self, result: object) -> None:
        self.result = result

    def login_with_oauth_code(self, code: str) -> object:
        assert code == "TEST-AUTH-CODE"
        return self.result


def session_behavior(session_path: Path) -> None:
    tree = parse(session_path)
    init_node = function(tree, "init_oauth")
    namespace: dict[str, object] = {"uplog": Log(), "raw": types.SimpleNamespace()}
    exec(compile(ast.Module([init_node], []), str(session_path), "exec"), namespace)
    init_oauth = namespace["init_oauth"]

    cases = [
        ({"user": {"id": "TEST-USER"}, "user_auth_token": "TEST-TOKEN"}, True, True),
        (None, False, False),
        ({"user": {"id": "TEST-USER"}}, False, False),
        ({"user": {}, "user_auth_token": "TEST-TOKEN"}, False, False),
    ]
    for result, expected, should_write in cases:
        config = Config()
        target = types.SimpleNamespace(api=API(result), config=config)
        assert init_oauth(target, "TEST-AUTH-CODE") is expected
        if should_write:
            assert config.values == {
                "user_auth_token": "TEST-TOKEN",
                "user_id": "TEST-USER",
            }
        else:
            assert config.values == {}


def live_permissions(cache_dir: Path) -> None:
    directory = cache_dir.stat()
    assert directory.st_mode & 0o777 == 0o700, oct(directory.st_mode & 0o777)
    result = subprocess.run(
        ["systemctl", "show", "upmpdcli.service", "-p", "UMask", "--value"],
        check=True,
        capture_output=True,
        text=True,
    )
    assert result.stdout.strip() == "0077", result.stdout
    config = cache_dir / "config"
    if config.exists():
        info = config.stat()
        assert info.st_uid == directory.st_uid
        assert info.st_mode & 0o077 == 0, oct(info.st_mode & 0o777)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--check-live-permissions", action="store_true")
    args = parser.parse_args()

    root = args.source_root
    app = root / "qobuz-app.py"
    session = root / "session.py"
    raw = root / "api" / "raw.py"
    for path in (app, session, raw):
        parse(path)
    callback_behavior(app)
    session_behavior(session)
    if args.check_live_permissions:
        if args.cache_dir is None:
            parser.error("--cache-dir is required with --check-live-permissions")
        live_permissions(args.cache_dir)
    print("PASS: Qobuz OAuth redaction, response semantics, exchange validation, and syntax")
    if args.check_live_permissions:
        print("PASS: Qobuz cache directory, existing cache-file mode, and upmpdcli UMask")


if __name__ == "__main__":
    main()
