const fs = require('fs');
const axios = require('axios');  // Import axios
const csv = require('csv-parser');

// Define constants
const CSV_FILE_PATH = '2024-11-01.csv';
const MAPPING_FILE_PATH = 'mapping.json';
const LOG_FILE_PATH = 'api_requests.log';  // Log file path

// Load configurations from a file
const loadConfig = () => {
  const configFile = fs.readFileSync('config.json', 'utf8');
  return JSON.parse(configFile);
};

// Load company-to-ID mapping
const loadMapping = () => {
  const mappingFile = fs.readFileSync(MAPPING_FILE_PATH, 'utf8');
  return JSON.parse(mappingFile);
};

// Parse the CSV file
const parseCSV = async (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
};

// Helper function to calculate the previous day in ISO format (YYYY-MM-DD)
const getPreviousDay = (date) => {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() - 1); // Subtract one day
  return newDate.toISOString().split('T')[0] + 'T23:00:00.000Z'; // Return the date at 23:00
};

// Format the API payload
const formatPayload = (line, projectId) => {
  // Get the startTime and endTime of the intervals
  const intervalStartTime = new Date(line['Date\\Started']);
  const intervalEndTime = new Date(line['End']);

  // Calculate the outer startTime (previous day at 23:00)
  const outerStartTime = getPreviousDay(intervalStartTime);

  // Calculate the outer endTime (same day as the interval's end, but at 23:00)
  const outerEndTime = intervalEndTime.toISOString().split('T')[0] + 'T23:00:00.000Z';

  // Create the payload structure
  return {
    id: '673cab8c2b00164687c238b5',  // Example ID, adjust if necessary
    intervals: [
      {
        startTime: line['Date\\Started'],   // Use the CSV start time
        endTime: line['End'],               // Use the CSV end time
        projectId: projectId,               // Use the mapped project ID
      },
    ],
    startTime: outerStartTime,  // Set the outer startTime
    endTime: outerEndTime,      // Set the outer endTime
  };
};

// Log the request to a file
const logRequest = (payload, headers) => {
  const logEntry = `
    Request Time: ${new Date().toISOString()}
    Headers: ${JSON.stringify(headers, null, 2)}
    Payload: ${JSON.stringify(payload, null, 2)}
    -------------------------------------------
  `;
  fs.appendFileSync(LOG_FILE_PATH, logEntry);  // Appends log to the file
};

// Perform API call using axios
const performAPICall = async (payload) => {
  try {
    const config = loadConfig();

    // Prepare the headers
    const headers = {
      Cookie: config.cookieHeader,
      Authorization: config.Authorization,
      Origin: config.Origin,
      Referer: config.Referer,
      'Content-Type': config.contentType,
    };

    // Log the request details
    logRequest(payload, headers);

    // Perform the PATCH request with Axios
    const response = await axios.patch(config.apiUrl, payload, { headers });

    console.log('API call succeeded:', response.data);
  } catch (error) {
    console.error('Network Error:', error.response ? error.response.data : error.message);
  }
};

// Main function
const main = async () => {
  try {
    const companyMapping = loadMapping();
    const csvData = await parseCSV(CSV_FILE_PATH);

    for (const line of csvData) {
      const companyName = line['Task'];  // Get company name from 'Task' column
      const projectId = companyMapping[companyName];

      if (!projectId) {
        console.warn(`No project ID found for company: ${companyName}`);
        continue;
      }

      const payload = formatPayload(line, projectId);
      await performAPICall(payload);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};

main();
