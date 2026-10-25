const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir = path.join(__dirname, 'src');

const bundleFiles = [
  'dist/wavesurfer.js',
  'dist/plugin/wavesurfer.regions.js',
  'oneup.js',
  'app.js',
  'keys.js',
  'markers.js',
  'contextmenu.js',
  'lufs.js',
  'ui-fx.js',
  'ui.js',
  'modal.js',
  'state.js',
  'engine.js',
  'actions.js',
  'drag.js',
  'recorder.js',
  'multitrack.js',
  'welcome.js',
  'fx-pg-eq.js',
  'fx-auto.js',
  'local.js',
  'id3.js',
  'lzma.js',
  'mixota-format.js',
  'mixota-cms.js'
];

console.log('Building Mixota production bundle...');

let concatenated = '';
for (const file of bundleFiles) {
  const filePath = path.join(srcDir, file);
  if (fs.existsSync(filePath)) {
    concatenated += fs.readFileSync(filePath, 'utf8') + '\n;\n';
  } else {
    console.warn(`Warning: File not found: ${filePath}`);
  }
}

const outputPath = path.join(srcDir, 'all.build.js');
const tempInputPath = path.join(srcDir, '_bundle.tmp.js');
fs.writeFileSync(tempInputPath, concatenated, 'utf8');

try {
  console.log('Minifying with uglify-js...');
  execSync(`npx uglify-js "${tempInputPath}" -c -m -o "${outputPath}"`, { stdio: 'inherit' });
  console.log(`Successfully generated ${outputPath}`);
} catch (e) {
  console.warn('Uglify failed or not installed, writing unminified bundle as fallback');
  fs.writeFileSync(outputPath, concatenated, 'utf8');
} finally {
  if (fs.existsSync(tempInputPath)) {
    fs.unlinkSync(tempInputPath);
  }
}

// Copy main.build.css to all.css for standalone cached builds
const cssSource = path.join(srcDir, 'main.build.css');
const cssDest = path.join(srcDir, 'all.css');
if (fs.existsSync(cssSource)) {
  fs.copyFileSync(cssSource, cssDest);
  console.log(`Synced ${cssDest}`);
}

console.log('Mixota build complete!');

