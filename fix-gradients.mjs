import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pagesDir = path.join(__dirname, 'src/pages');
const componentsDir = path.join(__dirname, 'src/components');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Replace text-foreground with text-white on gradient buttons
      // Pattern checks for bg-gradient-to-r [any from/to] followed by text-foreground
      // Or basically replace `text-foreground` on the same line as `bg-gradient` inside a button
      
      const lines = content.split('\n');
      let modified = false;
      const newLines = lines.map(line => {
        if (line.includes('<button') || line.includes('className="') || line.includes('className={`')) {
          if (line.includes('bg-gradient-to-') && line.includes('text-foreground') && !line.includes('bg-clip-text')) {
             modified = true;
             return line.replace(/text-foreground/g, 'text-white');
          }
        }
        return line;
      });
      
      if (modified) {
        fs.writeFileSync(fullPath, newLines.join('\n'));
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDir(pagesDir);
processDir(componentsDir);
