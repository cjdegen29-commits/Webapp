import sharp from 'sharp';

/**
 * Modernized Image Cleaner
 * Uses Sharp's native metadata and pipeline for speed.
 */
export async function cleanImage(inputPath, outputPath) {
  try {
    const pipeline = sharp(inputPath);

    const metadata = await pipeline.metadata();
    
    // 3. Execution Pipeline
    await pipeline
      .rotate()             // Automatically rotates based on EXIF data from phone
      .resize(2000, null, { // Standardizes width to 2000px, preserves aspect ratio
        withoutEnlargement: true,
        fit: 'inside'
      })
      .greyscale()
      .modulate({
        brightness: 1.2,    // Slightly brighten the background
        saturation: 0       // Ensure 0 color bleed
      })
      .threshold(160)       // CRITICAL: Turns grey/faded text into solid Black/White
      .sharpen()            // Hardens the edges of the characters
      .toFile(outputPath);

    return { success: true, width: metadata.width, height: metadata.height };
  } catch (err) {
    console.error('Image Processing Pipeline Failed:', err);
    throw err;
  }
}