import { spawn } from 'child_process';
import path from 'path';

export async function cleanImage(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve('./src/imageClean.py');

    const process = spawn('python', [
      scriptPath,
      inputPath,
      outputPath
    ]);

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        reject(new Error(`Python failed:\n${stderr || stdout}`));
      }
    });
  });
}