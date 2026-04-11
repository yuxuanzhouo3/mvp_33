// Script to clean debug code from chat-content.tsx
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app', 'chat', 'chat-content.tsx');
let lines = fs.readFileSync(filePath, 'utf-8').split('\n');

const result = [];
let i = 0;
let removed = 0;

while (i < lines.length) {
  const line = lines[i];
  const trimmed = line.trim();

  // Remove the _safeDebug function definition (lines 3-9)
  if (trimmed === '// 🔧 Safe debug wrapper - prevents crashes when __mpDebug is not a function') {
    // Skip the entire function block (comment + function + body + closing)
    while (i < lines.length && !lines[i].trim().startsWith('import ')) {
      removed++;
      i++;
    }
    continue;
  }

  // Remove single-line _safeDebug calls
  if (trimmed.match(/^_safeDebug\(/) || trimmed.match(/^\{ _safeDebug\(/)) {
    removed++;
    i++;
    continue;
  }

  // Remove "// 🔧 DEBUG" comment lines followed by if-block with _safeDebug
  if (trimmed.match(/^\/\/ 🔧 DEBUG/)) {
    // Check if next non-empty line is an if-block or _safeDebug call
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    
    if (j < lines.length && (lines[j].trim().startsWith('if (typeof window') || lines[j].trim().startsWith('_safeDebug') || lines[j].trim().startsWith('{ _safeDebug'))) {
      // Remove comment line
      removed++;
      i++;
      continue;
    }
  }

  // Remove if-block patterns: if (typeof window !== 'undefined' && ...__mpDebug...) { ... }
  if (trimmed.match(/^if \(typeof window !== 'undefined' && .*__mpDebug/) || 
      trimmed.match(/^\{ _safeDebug/) ||
      trimmed.match(/^if \(typeof window !== 'undefined' && typeof.*__mpDebug/)) {
    // Count opening braces to find matching close
    let braceCount = 0;
    let startI = i;
    do {
      const l = lines[i];
      for (const ch of l) {
        if (ch === '{') braceCount++;
        if (ch === '}') braceCount--;
      }
      removed++;
      i++;
    } while (braceCount > 0 && i < lines.length);
    continue;
  }

  // Remove standalone _safeDebug lines (with various indentation)
  if (trimmed.match(/^_safeDebug\(/)) {
    removed++;
    i++;
    continue;
  }

  result.push(lines[i]);
  i++;
}

// Also fix the loadUserData() catch block - keep it but remove debug-specific parts
let content = result.join('\n');

// Replace the crash handler to keep only the essential error handling
content = content.replace(
  /loadUserData\(\)\.catch\(\(err\) => \{\s*console\.error\('\[loadUserData\] 顶层未捕获错误:', err\)\s*\/\/ 🔧 DEBUG: Log to visible panel\s*_safeDebug\('💥CRASH'.*?\n.*?_safeDebug\('💥堆栈'.*?\n\s*\}\s*\/\/ CRITICAL: Reset loading state/s,
  `loadUserData().catch((err) => {\n      console.error('[loadUserData] Uncaught error:', err)\n      // Reset loading state`
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log(`Done! Removed ${removed} debug lines.`);
