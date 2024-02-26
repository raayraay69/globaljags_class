
// Import necessary libraries
const { Storage } = require('@google-cloud/storage');
const { Firestore } = require('@google-cloud/firestore');
const getExif = require('exif-async');
const parseDMS = require('parse-dms');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const sharp = require('sharp');

// Initialize Google Cloud clients
const storage = new Storage();
const firestore = new Firestore();


exports.processUpload = async (file, context) => {

    const storage = new Storage();
    const sourceBucket = storage.bucket('sp24-41200-erraymon-gj-uploads');
    const finalBucket = storage.bucket('sp24-41200-erraymon-gj-final');
    const thumbnailBucket = storage.bucket('sp24-41200-erraymon-gj-thumbnails');
    const filePath = file.name;
    const contentType = file.contentType;
    const fileExtension = contentType.split('/')[1];
    const fileNameWithoutExtension = path.basename(filePath, path.extname(filePath));
  
    // Validate if the uploaded file is an image (JPEG or PNG)
    if (!['image/jpeg', 'image/png'].includes(contentType)) {
      console.log(`Unsupported file type: ${contentType}`);
      return;
    }
  
    // Define paths for temporary local files
    const tempLocalDir = path.join(os.tmpdir(), 'thumbs');//path.dirname(tempLocalFile);
    const tempLocalFile = path.join(tempLocalDir, filePath);
  
    // Ensure the temp directory exists
    await fs.ensureDir(tempLocalDir);
  
    // Download file from the bucket
    await sourceBucket.file(filePath).download({destination: tempLocalFile});
    console.log(`Image downloaded locally to ${tempLocalFile}`);
  
    // Generate a thumbnail
    const thumbFileName = `thumb@64_${fileNameWithoutExtension}.${fileExtension}`;
    const tempLocalThumbFile = path.join(os.tmpdir(), thumbFileName);
  
    await sharp(tempLocalFile).resize(64, 64).toFile(tempLocalThumbFile);
    console.log(`Thumbnail generated at ${tempLocalThumbFile}`);
  
    // Upload the thumbnail to the thumbnails bucket
    await thumbnailBucket.upload(tempLocalThumbFile, {destination: thumbFileName});
    console.log(`Thumbnail uploaded to ${thumbnailBucket}`);
  
    // Optionally, move the original image to the final bucket
    //await sourceBucket.file(filePath).move(finalBucket).file(filePath);
    await finalBucket.upload(tempLocalFile);
    console.log(`Image moved to ${finalBucket}`);
  
    // Extract EXIF data
    try {
      const exifData = await getExif(tempLocalFile);
      if (exifData && exifData.gps) {
        const gpsData = exifData.gps;
        const gpsCoordinates = getGPSCoordinates(gpsData);
        console.log(`Extracted GPS Coordinates:`, gpsCoordinates);
  
        // Write data to Firestore
        const docRef = await firestore.collection('imagesData').add({
          filePath,
          gpsCoordinates,
          thumbFileName
        });
        console.log(`Document written to Firestore with ID: ${docRef.id}`);
      } else {
        console.log('No GPS data found in image EXIF.');
      }
    } catch (ex) {
      console.error('Error extracting EXIF data:', ex);
    }
  
    // Clean up local filesystem
    await fs.remove(tempLocalDir);
    console.log(`Cleaned up local files.`);
  };
  
  // Helper function to convert GPS data to decimal coordinates
  function getGPSCoordinates(gpsData) {
    // This function will depend on the structure of your EXIF data and may need adjustment
    // Assuming `parseDMS` can directly parse the GPS strings from EXIF data
    const lat = parseDMS(`${gpsData.GPSLatitudeRef} ${gpsData.GPSLatitude}`);
    const lon = parseDMS(`${gpsData.GPSLongitudeRef} ${gpsData.GPSLongitude}`);
    return { lat, lon };
  }