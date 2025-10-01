/**
 * Result of input validation
 */
export interface ValidationResult {
  /** Whether the input is valid */
  valid: boolean;
  /** Sanitized version of the input (only present if valid is true) */
  sanitized?: string;
  /** Error message (only present if valid is false) */
  error?: string;
  /** Details about what was sanitized or removed */
  details?: string[];
}

/**
 * Options for input validation
 */
export interface ValidationOptions {
  /** Maximum allowed length (default: 10000) */
  maxLength?: number;
  /** Whether to allow YAML special characters at line start (default: false) */
  allowYamlSpecialChars?: boolean;
  /** Whether to allow non-ASCII characters (default: false) */
  allowNonAscii?: boolean;
  /** Custom forbidden patterns to check */
  customPatterns?: RegExp[];
}

/**
 * InputValidator provides sanitization and validation of user input to prevent
 * injection attacks and ensure data integrity.
 *
 * Protects against:
 * - Template injection (${...})
 * - Script injection (<script>)
 * - Path traversal (../)
 * - YAML special characters that could break parsing
 * - Non-ASCII characters that could cause encoding issues
 * - Excessively long input
 *
 * @example
 * ```typescript
 * const validator = new InputValidator();
 * const result = validator.validateUserInput(userInput);
 * if (result.valid) {
 *   // Use result.sanitized
 * } else {
 *   // Handle error: result.error
 * }
 * ```
 */
export class InputValidator {
  private readonly defaultMaxLength: number = 10000;

  /**
   * Forbidden patterns that indicate potential security issues
   */
  private readonly forbiddenPatterns: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /\$\{.*\}/, name: 'Template injection' },
    { pattern: /<script/i, name: 'Script injection' },
    { pattern: /\.\.\/\.\.\//g, name: 'Path traversal' },
    { pattern: /javascript:/i, name: 'JavaScript protocol' },
    { pattern: /data:text\/html/i, name: 'Data URI HTML' },
    { pattern: /on\w+\s*=/i, name: 'Event handler' },
  ];

  /**
   * Validates and sanitizes user input.
   *
   * @param input - The user input to validate
   * @param options - Validation options
   * @returns Validation result with sanitized input or error message
   */
  validateUserInput(input: string, options: ValidationOptions = {}): ValidationResult {
    const maxLength = options.maxLength ?? this.defaultMaxLength;
    const details: string[] = [];

    // Length check
    if (input.length > maxLength) {
      return {
        valid: false,
        error: `Input too long (${input.length} characters, maximum ${maxLength})`,
      };
    }

    // Empty input check
    if (input.trim().length === 0) {
      return {
        valid: false,
        error: 'Input cannot be empty',
      };
    }

    // Sanitize FIRST before validation
    let sanitized = input;

    // Remove or escape non-ASCII characters if not allowed
    if (!options.allowNonAscii) {
      const originalLength = sanitized.length;
      sanitized = sanitized.replace(/[^\x20-\x7E\n\r\t]/g, '');
      if (sanitized.length !== originalLength) {
        details.push(`Removed ${originalLength - sanitized.length} non-ASCII characters`);
      }
    }

    // Remove YAML special characters at line start if not allowed
    if (!options.allowYamlSpecialChars) {
      const beforeSanitize = sanitized;
      // Improved YAML sanitization - handles more special chars
      sanitized = sanitized.replace(/^[-!&*[\]{}|>@`"':?%]/gm, '');
      if (beforeSanitize !== sanitized) {
        details.push('Removed YAML special characters from line starts');
      }
    }

    // Normalize whitespace
    const beforeWhitespace = sanitized;
    sanitized = this.normalizeWhitespace(sanitized);
    if (beforeWhitespace !== sanitized) {
      details.push('Normalized whitespace');
    }

    // Check sanitized content is not empty
    if (sanitized.trim().length === 0) {
      return {
        valid: false,
        error: 'Input contains no valid content after sanitization',
      };
    }

    // THEN validate patterns on sanitized input
    const forbiddenPatterns = [
      ...this.forbiddenPatterns,
      ...(options.customPatterns?.map((p) => ({ pattern: p, name: 'Custom' })) ?? []),
    ];

    for (const { pattern, name } of forbiddenPatterns) {
      if (pattern.test(sanitized)) {
        return {
          valid: false,
          error: `Invalid pattern detected: ${name}`,
        };
      }
    }

    return {
      valid: true,
      sanitized,
      ...(details.length > 0 && { details }),
    };
  }

  /**
   * Validates input specifically for YAML content.
   * More permissive than general validation, allowing YAML-specific patterns.
   *
   * @param input - The YAML content to validate
   * @param options - Validation options
   * @returns Validation result
   */
  validateYamlContent(input: string, options: ValidationOptions = {}): ValidationResult {
    return this.validateUserInput(input, {
      ...options,
      allowYamlSpecialChars: true,
      allowNonAscii: false,
    });
  }

  /**
   * Validates a file path to prevent path traversal attacks.
   *
   * @param filePath - The file path to validate
   * @returns Validation result
   */
  validateFilePath(filePath: string): ValidationResult {
    // Check for path traversal
    if (filePath.includes('..')) {
      return {
        valid: false,
        error: 'Path traversal detected',
      };
    }

    // Check for absolute paths (should be relative)
    if (filePath.startsWith('/')) {
      return {
        valid: false,
        error: 'Absolute paths are not allowed',
      };
    }

    // Check for valid characters (alphanumeric, dash, underscore, dot, slash)
    if (!/^[a-zA-Z0-9_.\-/]+$/.test(filePath)) {
      return {
        valid: false,
        error: 'Invalid characters in file path',
      };
    }

    return {
      valid: true,
      sanitized: filePath,
    };
  }

  /**
   * Validates an identifier (e.g., category name, requirement ID).
   *
   * @param identifier - The identifier to validate
   * @param maxLength - Maximum length for the identifier (default: 50)
   * @returns Validation result
   */
  validateIdentifier(identifier: string, maxLength: number = 50): ValidationResult {
    // Length check
    if (identifier.length > maxLength) {
      return {
        valid: false,
        error: `Identifier too long (${identifier.length} characters, maximum ${maxLength})`,
      };
    }

    // Must not be empty
    if (identifier.trim().length === 0) {
      return {
        valid: false,
        error: 'Identifier cannot be empty',
      };
    }

    // Must start with letter or number
    if (!/^[a-zA-Z0-9]/.test(identifier)) {
      return {
        valid: false,
        error: 'Identifier must start with a letter or number',
      };
    }

    // Only alphanumeric, dash, and underscore
    if (!/^[a-zA-Z0-9_-]+$/.test(identifier)) {
      return {
        valid: false,
        error: 'Identifier must contain only letters, numbers, dashes, and underscores',
      };
    }

    return {
      valid: true,
      sanitized: identifier,
    };
  }

  /**
   * Normalizes whitespace in input:
   * - Trims leading/trailing whitespace
   * - Collapses multiple spaces to single space (except in multi-line content)
   * - Normalizes line endings to \n
   *
   * @param input - The input to normalize
   * @returns Normalized input
   */
  private normalizeWhitespace(input: string): string {
    // Normalize line endings
    let normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove leading and trailing whitespace from each line
    normalized = normalized.replace(/^[ \t]+/gm, '').replace(/[ \t]+$/gm, '');

    // Collapse multiple consecutive blank lines to single blank line
    normalized = normalized.replace(/\n{3,}/g, '\n\n');

    // Trim overall input
    normalized = normalized.trim();

    return normalized;
  }
}
