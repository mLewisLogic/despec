#!/usr/bin/env bash

set -euo pipefail

# Parse --check flag
CHECK_ONLY=false
if [[ $# -gt 0 && "$1" == "--check" ]]; then
	CHECK_ONLY=true
fi

EXCLUDE_DIRS=(
	".git"
	"node_modules"
)

EXCLUDES=""
for dir in "${EXCLUDE_DIRS[@]}"; do
	EXCLUDES+="-path '*/${dir}' -prune -o "
done

# Get shell files
readarray -d '' EXT_FILES < <(
	eval "find . ${EXCLUDES} -type f -size -1M \( -name '*.sh' \) -print0" || true
)

readarray -d '' NO_EXT_FILES < <(
	eval "find . ${EXCLUDES} -type f ! -name '*.*' -size +0 -size -1M -print0" |
		xargs -0 -r grep -Il -m1 '^#!/.*\(sh\)' 2>/dev/null |
		tr '\n' '\0' || true
)

FILES=()
[[ ${#EXT_FILES[@]} -gt 0 ]] && FILES+=("${EXT_FILES[@]}")
[[ ${#NO_EXT_FILES[@]} -gt 0 ]] && FILES+=("${NO_EXT_FILES[@]}")

if [[ ${#FILES[@]} -eq 0 ]]; then
	echo "No shell files found"
	exit 0
fi

if [[ "$CHECK_ONLY" == true ]]; then
	echo "Checking format and linting ${#FILES[@]} files..."
else
	echo "Formatting and linting ${#FILES[@]} files..."
fi

echo "Running shfmt..."
if [[ "$CHECK_ONLY" == true ]]; then
	shfmt --diff "${FILES[@]}"
else
	shfmt --write "${FILES[@]}"
fi

echo "Running shellcheck..."
shellcheck "${FILES[@]}"

if [[ "$CHECK_ONLY" == true ]]; then
	echo "All shell files passed checks!"
else
	echo "All shell files passed!"
fi
