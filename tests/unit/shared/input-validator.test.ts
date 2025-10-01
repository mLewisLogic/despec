import { describe, expect, test } from "bun:test";
import { InputValidator } from "../../../src/shared/input-validator.js";

describe("InputValidator", () => {
  const validator = new InputValidator();

  describe("validateUserInput", () => {
    test("validates clean input", () => {
      const result = validator.validateUserInput("This is clean input");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("This is clean input");
    });

    test("rejects input exceeding max length", () => {
      const longInput = "a".repeat(10001);
      const result = validator.validateUserInput(longInput);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Input too long");
    });

    test("respects custom max length", () => {
      const result = validator.validateUserInput("Test", { maxLength: 3 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Input too long");
    });

    test("rejects empty input", () => {
      const result = validator.validateUserInput("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });

    test("detects template injection", () => {
      const result = validator.validateUserInput("Hello $" + "{malicious}");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Template injection");
    });

    test("detects script injection", () => {
      const result = validator.validateUserInput(
        "Hello <script>alert(1)</script>",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Script injection");
    });

    test("detects case-insensitive script injection", () => {
      const result = validator.validateUserInput(
        "Hello <SCRIPT>alert(1)</SCRIPT>",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Script injection");
    });

    test("detects path traversal", () => {
      const result = validator.validateUserInput("../../etc/passwd");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Path traversal");
    });

    test("detects javascript protocol", () => {
      const result = validator.validateUserInput("javascript:alert(1)");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("JavaScript protocol");
    });

    test("detects data URI HTML", () => {
      const result = validator.validateUserInput("data:text/html,test");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Data URI HTML");
    });

    test("detects event handlers", () => {
      const result = validator.validateUserInput('<div onclick="alert(1)">');
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Event handler");
    });

    test("removes non-ASCII characters by default", () => {
      const result = validator.validateUserInput("Hello 世界 café");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("Hello  caf");
      expect(result.details).toContain("Removed 3 non-ASCII characters");
    });

    test("allows non-ASCII when configured", () => {
      const result = validator.validateUserInput("Hello 世界", {
        allowNonAscii: true,
      });
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("Hello 世界");
    });

    test("removes YAML special chars at line start by default", () => {
      const result = validator.validateUserInput("-dangerous\n!also-dangerous");
      expect(result.valid).toBe(true);
      expect(
        result.details?.some((d) => d.includes("YAML special characters")),
      ).toBe(true);
    });

    test("allows YAML special chars when configured", () => {
      const result = validator.validateUserInput("-safe", {
        allowYamlSpecialChars: true,
      });
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("-safe");
    });

    test("normalizes whitespace", () => {
      const result = validator.validateUserInput(
        "  Hello  \r\n  World  \r\n\r\n\r\n  ",
      );
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("Hello\nWorld");
      expect(
        result.details?.some((d) => d.includes("Normalized whitespace")),
      ).toBe(true);
    });

    test("validates with custom patterns", () => {
      const result = validator.validateUserInput("custom-forbidden", {
        customPatterns: [/forbidden/],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Custom");
    });

    test("rejects input that becomes empty after sanitization", () => {
      const result = validator.validateUserInput("世界");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("no valid content");
    });
  });

  describe("validateYamlContent", () => {
    test("allows YAML special characters", () => {
      const yamlContent = "- item1\n- item2\n!tag value";
      const result = validator.validateYamlContent(yamlContent);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("- item1\n- item2\n!tag value");
    });

    test("still rejects malicious content", () => {
      const result = validator.validateYamlContent("$" + "{malicious}");
      expect(result.valid).toBe(false);
    });
  });

  describe("validateFilePath", () => {
    test("validates clean file path", () => {
      const result = validator.validateFilePath("path/to/file.txt");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("path/to/file.txt");
    });

    test("rejects path traversal", () => {
      const result = validator.validateFilePath("../etc/passwd");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Path traversal");
    });

    test("rejects absolute paths", () => {
      const result = validator.validateFilePath("/etc/passwd");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Absolute paths");
    });

    test("rejects invalid characters", () => {
      const result = validator.validateFilePath("path/to/file?.txt");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid characters");
    });

    test("allows valid characters", () => {
      const result = validator.validateFilePath("path/to/my-file_123.txt");
      expect(result.valid).toBe(true);
    });
  });

  describe("validateIdentifier", () => {
    test("validates clean identifier", () => {
      const result = validator.validateIdentifier("valid-identifier_123");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("valid-identifier_123");
    });

    test("rejects empty identifier", () => {
      const result = validator.validateIdentifier("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });

    test("rejects identifier exceeding max length", () => {
      const result = validator.validateIdentifier("a".repeat(51), 50);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too long");
    });

    test("rejects identifier not starting with alphanumeric", () => {
      const result = validator.validateIdentifier("-starts-with-dash");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must start with a letter or number");
    });

    test("rejects identifier with invalid characters", () => {
      const result = validator.validateIdentifier("invalid space");
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        "letters, numbers, dashes, and underscores",
      );
    });

    test("allows identifier with dashes and underscores", () => {
      const result = validator.validateIdentifier("valid_identifier-123");
      expect(result.valid).toBe(true);
    });
  });
});
