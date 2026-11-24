// Sets the store version everywhere it lives. Usage: npm run version:set -- 1.4.0 [buildNumber]
// buildNumber (iOS CFBundleVersion / Android versionCode) must go up on every upload; CI passes
// the GitHub run number, so you normally only set the marketing version here.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [ver, build] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(ver || '')) { console.error('usage: npm run version:set -- 1.4.0 [build]'); process.exit(1); }
const pkg = JSON.parse(readFileSync('package.json', 'utf8')); pkg.version = ver; writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
const pbx = 'ios/App/App.xcodeproj/project.pbxproj';
if (existsSync(pbx)) {
  let s = readFileSync(pbx, 'utf8').replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${ver};`);
  if (build) s = s.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
  writeFileSync(pbx, s);
}
const gradle = 'android/app/build.gradle';
if (existsSync(gradle)) {
  let s = readFileSync(gradle, 'utf8').replace(/versionName "[^"]*"/, `versionName "${ver}"`);
  if (build) s = s.replace(/versionCode \d+/, `versionCode ${build}`);
  writeFileSync(gradle, s);
}
console.log('version', ver, build ? 'build ' + build : '');
