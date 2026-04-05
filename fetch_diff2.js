import fs from 'fs';

async function run() {
  const files = ['package.json', 'tsconfig.json', 'vite.config.ts', 'src/main.ts'];
  for (const file of files) {
    const res = await fetch('https://raw.githubusercontent.com/digitalurban/city-clock/main/' + file);
    const remoteCode = await res.text();
    const localCode = fs.readFileSync('/' + file, 'utf-8');
    
    if (remoteCode === localCode) {
      console.log(file, "is identical");
    } else {
      console.log(file, "differs. Remote length:", remoteCode.length, "Local length:", localCode.length);
    }
  }
}
run();
