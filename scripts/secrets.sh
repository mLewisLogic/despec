#!/usr/bin/env bash
set -euo pipefail

# Configuration
KEY_DIR="$HOME/.keys/${APP_NAME}"
KEY_FILE="$KEY_DIR/${MISE_ENV}.age.key"
SECRETS_FILE="secrets/${MISE_ENV}.enc.yaml"
SOPS_CONFIG=".sops.yaml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
error() {
	echo -e "${RED}❌ $1${NC}" >&2
	exit 1
}

success() {
	echo -e "${GREEN}✅ $1${NC}"
}

info() {
	echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Update .sops.yaml with the public key
update_sops_yaml() {
	local public_key="$1"
	local temp_file="${SOPS_CONFIG}.tmp"

	if [ ! -f "$SOPS_CONFIG" ]; then
		info "Creating .sops.yaml"
		cat >"$SOPS_CONFIG" <<EOF
creation_rules:
  - path_regex: secrets/.*\.enc\.yaml$
    age: ${public_key}
EOF
		success ".sops.yaml created with public key"
		return
	fi

	# Use sed to replace the age key in the SOPS config (matches both age keys and placeholders)
	sed "s|age: .*|age: ${public_key}|" "$SOPS_CONFIG" >"$temp_file"
	mv "$temp_file" "$SOPS_CONFIG"

	success ".sops.yaml updated with new public key"
}

# Ensure age key exists, create if needed
ensure_key() {
	local key_existed=false

	if [ -f "$KEY_FILE" ]; then
		key_existed=true
	else
		# Create directory and generate key
		mkdir -p "$KEY_DIR"
		chmod 700 "$KEY_DIR"

		info "Generating age key..."
		age-keygen -o "$KEY_FILE" 2>/dev/null
		chmod 600 "$KEY_FILE"

		success "Age key generated"
		echo "   Private key: $KEY_FILE"
	fi

	# Get public key
	PUBLIC_KEY=$(age-keygen -y "$KEY_FILE" 2>/dev/null)

	if [ "$key_existed" = false ]; then
		echo "   Public key:  $PUBLIC_KEY"
		echo ""
	fi

	# Always ensure .sops.yaml exists and is up to date
	update_sops_yaml "$PUBLIC_KEY"
}

# Generate Age key (for key rotation scenarios)
generate_key() {
	# Check if key already exists
	if [ -f "$KEY_FILE" ]; then
		info "Age key already exists at $KEY_FILE"
		PUBLIC_KEY=$(age-keygen -y "$KEY_FILE" 2>/dev/null)
		echo "   Public key: $PUBLIC_KEY"
		echo ""

		# Ask if user wants to update .sops.yaml
		read -p "Update .sops.yaml with this public key? (y/N): " -n 1 -r
		echo
		if [[ $REPLY =~ ^[Yy]$ ]]; then
			update_sops_yaml "$PUBLIC_KEY"
		fi
		exit 0
	fi

	ensure_key

	echo ""
	info "Next steps:"
	echo "  1. Initialize secrets: mise run secrets init"
	echo "  2. Edit secrets:       mise run secrets edit"
}

# Initialize secrets file
init() {
	if [ -f "$SECRETS_FILE" ]; then
		info "Secrets file already exists: $SECRETS_FILE"
		echo "   Edit with: mise run secrets edit"
		exit 0
	fi

	# Ensure key and .sops.yaml exist
	ensure_key

	mkdir -p secrets
	echo "EXAMPLE_SECRET: test" >"$SECRETS_FILE"

	export SOPS_AGE_KEY_FILE="$KEY_FILE"
	sops -e -i "$SECRETS_FILE"

	success "Secrets file initialized: $SECRETS_FILE"
	echo "   Edit with: mise run secrets edit"
}

# Edit secrets file
edit() {
	if [ ! -f "$SECRETS_FILE" ]; then
		error "Secrets file not found. Run: mise run secrets init"
	fi

	export SOPS_AGE_KEY_FILE="$KEY_FILE"
	sops "$SECRETS_FILE"
}

# Set a secret key
set_key() {
	local key_name="${2:-}"

	if [ -z "$key_name" ]; then
		error "Usage: $0 set <KEY_NAME>"
	fi

	# Initialize file if it doesn't exist
	if [ ! -f "$SECRETS_FILE" ] || [ ! -s "$SECRETS_FILE" ]; then
		info "Secrets file not found. Initializing..."
		init || exit 1
	fi

	echo "Enter value for $key_name:"
	read -r -s value

	if [ -z "$value" ]; then
		error "Value cannot be empty"
	fi

	export SOPS_AGE_KEY_FILE="$KEY_FILE"
	sops set "$SECRETS_FILE" "[\"$key_name\"]" "\"$value\""
	success "$key_name set"
}

# Get a secret key value
get_key() {
	local key_name="${2:-}"

	if [ -z "$key_name" ]; then
		error "Usage: $0 get <KEY_NAME>"
	fi

	if [ ! -f "$SECRETS_FILE" ]; then
		error "No secrets file found. Run: mise run secrets init"
	fi

	export SOPS_AGE_KEY_FILE="$KEY_FILE"
	sops exec-env "$SECRETS_FILE" "echo \$$key_name"
}

# List all secret keys (not values)
list_keys() {
	if [ ! -f "$SECRETS_FILE" ]; then
		error "No secrets file found. Run: mise run secrets init"
	fi

	export SOPS_AGE_KEY_FILE="$KEY_FILE"
	echo "Secrets:"
	sops -d "$SECRETS_FILE" 2>/dev/null | grep -E '^[A-Z_]+:' | cut -d':' -f1 | sed 's/^/  - /'
}

# Show usage
usage() {
	cat <<EOF
Usage: $0 <command> [arguments]

Commands:
  generate-key        Generate Age keypair and update .sops.yaml
  init                Initialize encrypted secrets file
  edit                Edit secrets file with SOPS
  set <KEY_NAME>      Set a secret value
  get <KEY_NAME>      Get a secret value
  list                List all secret keys (not values)
  help                Show this help message

Examples:
  $0 generate-key
  $0 init
  $0 set DUNE_API_KEY
  $0 get DUNE_API_KEY
  $0 list
EOF
	exit 0
}

# Main command dispatcher
main() {
	if [ $# -eq 0 ]; then
		usage
	fi

	case "$1" in
	generate-key)
		generate_key
		;;
	init)
		init
		;;
	edit)
		edit
		;;
	set)
		set_key "$@"
		;;
	get)
		get_key "$@"
		;;
	list)
		list_keys
		;;
	help | --help | -h)
		usage
		;;
	*)
		error "Unknown command: $1\n\nRun '$0 help' for usage information."
		;;
	esac
}

main "$@"
