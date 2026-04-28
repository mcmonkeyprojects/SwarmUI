const fs = require('fs');
const path = require('path');

// Track imports and their sources
const importMap = new Map();
const missingImports = new Map();

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Match import/export from relative paths
      const importRegex = /(import|export)(\s+type|\s+const|\s+default)?[\s\n]*(?:\{[^}]*\}|\*\s+as\s+\w+|[^;]*?)[\s\n]*from\s+['"]([./][^'"]*)['"]/g;
      let match;

      while ((match = importRegex.exec(content)) !== null) {
        const fullMatch = match[0];
        const importPath = match[3];

        // Only check relative imports
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
          const relFilePath = filePath.replace(/\\/g, '/');

          if (!importMap.has(importPath)) {
            importMap.set(importPath, []);
          }
          importMap.get(importPath).push({
            file: relFilePath,
            line: content.substring(0, match.index).split('\n').length,
            code: fullMatch.trim()
          });
        }
      }
    }
  });
}

walkDir('./src');

// Now check which imports don't exist
console.log('Checking for missing imports...\n');

let foundMissing = false;

importMap.forEach((sources, importPath) => {
  // Resolve the import path relative to each source file's directory
  sources.forEach(source => {
    const sourceDir = path.dirname(source.file);
    const targetPath = path.resolve(sourceDir, importPath);

    // Check if the target exists (with .ts, .tsx, .js, .jsx, /index.ts, etc.)
    const possiblePaths = [
      targetPath,
      targetPath + '.ts',
      targetPath + '.tsx',
      targetPath + '.js',
      targetPath + '.jsx',
      path.join(targetPath, 'index.ts'),
      path.join(targetPath, 'index.tsx'),
      path.join(targetPath, 'index.js'),
      path.join(targetPath, 'index.jsx'),
    ];

    const exists = possiblePaths.some(p => {
      try {
        fs.accessSync(p);
        return true;
      } catch {
        return false;
      }
    });

    if (!exists) {
      foundMissing = true;
      if (!missingImports.has(importPath)) {
        missingImports.set(importPath, []);
      }
      missingImports.get(importPath).push(source);
    }
  });
});

if (foundMissing) {
  console.log('FOUND MISSING IMPORTS:\n');
  missingImports.forEach((sources, importPath) => {
    console.log(`Import path: ${importPath}`);
    sources.forEach(source => {
      console.log(`  File: ${source.file}`);
      console.log(`  Line: ${source.line}`);
      console.log(`  Code: ${source.code}`);
    });
    console.log();
  });
} else {
  console.log('No missing imports found!');
}
