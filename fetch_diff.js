import fs from 'fs';

async function run() {
  const res = await fetch('https://raw.githubusercontent.com/digitalurban/city-clock/main/src/city/CityLayout.ts');
  const remoteCode = await res.text();
  const localCode = fs.readFileSync('src/city/CityLayout.ts', 'utf-8');
  
  if (remoteCode === localCode) {
    console.log("Files are identical");
  } else {
    console.log("Files differ. Remote length:", remoteCode.length, "Local length:", localCode.length);
    // Find first difference
    for (let i = 0; i < Math.min(remoteCode.length, localCode.length); i++) {
      if (remoteCode[i] !== localCode[i]) {
        console.log("First difference at index", i);
        console.log("Remote:", remoteCode.substring(i, i + 50));
        console.log("Local:", localCode.substring(i, i + 50));
        break;
      }
    }
  }
}
run();
