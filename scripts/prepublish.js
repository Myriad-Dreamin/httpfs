const fs = require('fs');
const path = require('path');

const packageRoot = path.resolve(__dirname, '../');
const distributionPath = path.resolve(packageRoot, 'dist/');

fs.copyFileSync(path.resolve(packageRoot, 'package.json'), path.resolve(distributionPath, 'package.json'));
fs.copyFileSync(path.resolve(packageRoot, 'LICENSE'), path.resolve(distributionPath, 'LICENSE'));
fs.copyFileSync(path.resolve(packageRoot, 'README.md'), path.resolve(distributionPath, 'README.md'));
fs.copyFileSync(path.resolve(__dirname, '.npmignore.template'), path.resolve(distributionPath, '.npmignore'));
