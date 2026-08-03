#!/usr/bin/env python

import os
import logging
import urllib.request
import re
import json

def fetch_antora_utils() -> None:
    branch = "main"
    target_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "antora_utils.py")
    url_path = f"{os.getenv('GITHUB_REPOSITORY_OWNER')}/hz-docs/{branch}/.github/scripts/antora_utils.py"
    if not os.path.exists(target_path):
        url = f"https://raw.githubusercontent.com/{url_path}"
        urllib.request.urlretrieve(url, filename=target_path)

# `antora_utils.py is mocked in unit tests so `import` works as intended
fetch_antora_utils()
import antora_utils as utils
logger: logging.Logger = utils.setup_logger(__name__)

REDIRECTS_FILE: str = "_redirects"
SEARCH_FILE: str = "search-config.json"

def process_redirects(
    master_major_minor:str,
    rel_major_minor:str
) -> None:

    updated_latest = False
    updated_latest_dev = False

    with open(REDIRECTS_FILE, 'r+') as f:
        lines = f.readlines()
        
        for idx, line in enumerate(lines):
            if line.startswith("/hazelcast/latest/*"):
                lines[idx] = re.sub(r"(\s+/hazelcast/)[^/]+", rf"\g<1>{rel_major_minor}", line)
                updated_latest = True
            elif line.startswith("/hazelcast/latest-dev/*"):
                lines[idx] = re.sub(r"(\s+/hazelcast/)[^/]+", rf"\g<1>{master_major_minor}-snapshot", line)
                updated_latest_dev = True
                
        if not updated_latest:
            raise ValueError(f"Target pattern '/hazelcast/latest/*' was not found in {REDIRECTS_FILE}")
        if not updated_latest_dev:
            raise ValueError(f"Target pattern '/hazelcast/latest-dev/*' was not found in {REDIRECTS_FILE}")

        f.seek(0)
        f.writelines(lines)
        f.truncate()

    logger.debug(f"Successfully updated redirects file rules in {REDIRECTS_FILE}")

def process_search_config(
    master_major_minor:str,
    rel_major_minor:str
) -> None:

    updated_search = False

    with open(SEARCH_FILE, 'r+') as f:
        config_data = json.load(f)
        start_urls = config_data.get("start_urls", [])
        new_start_urls = []
        
        for entry in start_urls:
            new_start_urls.append(entry)
            
            if (
                entry.get("url") and "https://docs.hazelcast.com/hazelcast/(?P<version>.*?)/" in entry.get("url")
                and entry.get("tags")
                and entry["tags"][0].startswith("hazelcast-")
                and entry["tags"][0].endswith("-snapshot")
            ):
                matched_url = entry.get("url")
                entry["tags"] = [f"hazelcast-{master_major_minor}-snapshot"]
                entry["variables"]["version"] = [f"{master_major_minor}-snapshot"]
                
                release_entry = {
                    "url": matched_url,
                    "tags": [f"hazelcast-{rel_major_minor}"],
                    "variables": {
                        "version": [rel_major_minor]
                    },
                    "selectors_key": "hz"
                }
                new_start_urls.append(release_entry)
                updated_search = True
                
        if not updated_search:
            raise ValueError(f"Target hazelcast snapshot entry configuration block was not found in {SEARCH_FILE}")

        config_data["start_urls"] = new_start_urls
        
        f.seek(0)
        json.dump(config_data, f, indent=2)
        f.truncate()

    logger.debug(f"Successfully updated search configuration in {SEARCH_FILE}")

def update_main(
    master_version:str,
    master_major_minor:str,
    rel_major_minor:str
) -> None:

    target_base: str = "main"
    update_branch: str = utils.checkout_branch("update_redirects_search", target_base)
    
    process_redirects(
        master_major_minor=master_major_minor,
        rel_major_minor=rel_major_minor
    )

    process_search_config(
        master_major_minor=master_major_minor,
        rel_major_minor=rel_major_minor
    )
    
    utils.commit_changes(
        target_base,
        master_version,
        [f"{REDIRECTS_FILE}", f"{SEARCH_FILE}"],
        update_branch
    )

    utils.create_github_pr(target_base, update_branch, master_version)

def update(
    rel_major_minor:str,
    master_version:str,
    master_major_minor:str,
    is_rel_major_minor:str
) -> None:

    if is_rel_major_minor == "true":
        update_main(
            master_version=master_version,
            master_major_minor=master_major_minor,
            rel_major_minor=rel_major_minor
        )
    else:
        logger.info("Skip '_redirects' and 'search-config.json' updates for BETA or PATCH release")

def merge_pull_requests(
    is_rel_major_minor:str,
    master_version:str
) -> None:

    if is_rel_major_minor == "true":
        utils.merge_github_pr("main", master_version)
    else:
        logger.info("Skip '_redirects' and 'search-config.json' updates for BETA or PATCH release")
