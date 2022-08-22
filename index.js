const request = require("request");
const fs = require("fs");
const path = require("path");
const _ = require("lodash");
const csvParse = require("csv-parse/lib/sync");

const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const SEP = path.sep;
// const DirName = process.cwd();
const DirName = __dirname.match(/snapshot/i)
	? path.dirname(process.execPath)
	: process.cwd();

const imageExtensions = [
	"3dm",
	"3ds",
	"max",
	"bmp",
	"dds",
	"gif",
	"jpg",
	"jpeg",
	"png",
	"psd",
	"xcf",
	"tga",
	"thm",
	"tif",
	"tiff",
	"yuv",
	"ai",
	"eps",
	"ps",
	"svg",
	"dwg",
	"dxf",
	"gpx",
	"kml",
	"kmz",
	"webp",
];
const HOME_FOLDER = `.${SEP}images${SEP}`;
const HOME_PATH = path.join(DirName, path.normalize(HOME_FOLDER));
console.log("images path", HOME_PATH);

const getAllFiles = function (dirPath, arrayOfFiles) {
	if (!fs.existsSync(dirPath)) {
		console.log("images folder does not exist");
		process.exit(1);
	}
	let files = fs.readdirSync(dirPath);

	arrayOfFiles = arrayOfFiles || {};
	const curdirname = path.basename(dirPath);
	arrayOfFiles[curdirname] || (arrayOfFiles[curdirname] = []);
	files.forEach(function (file) {
		if (fs.statSync(dirPath + "/" + file).isDirectory()) {
			arrayOfFiles = getAllFiles(dirPath + SEP + file, arrayOfFiles);
		} else {
			let extname = path.extname(file).toLowerCase().replace(".", "");
			if (imageExtensions.includes(extname)) {
				arrayOfFiles[curdirname].push(path.join(dirPath, SEP, file));
			}
		}
	});
	arrayOfFiles = Object.entries(arrayOfFiles)
		.sort(([, a], [, b]) => {
			return a.length - b.length;
		})
		.reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
	return arrayOfFiles;
};

const readUploadedFiles = (path) => {
	try {
		if (!fs.existsSync(path)) {
			// console.log(path, "doesn't exist");
			return {};
		}
		const data = fs.readFileSync(path, {
			encoding: "utf8",
		});
		// console.log(data);
		let records = {};
		csvParse(data, {
			columns: true,
			on_record: (record) => {
				records[record.file_name] = {
					...record,
				};
			},
		});
		return records;
	} catch (error) {
		return {};
	}
};

const csvWriter = (path) =>
	createCsvWriter({
		path,
		header: [
			{ id: "file", title: "file_name" },
			{ id: "status", title: "status" },
			{ id: "cdn_link", title: "cdn_link" },
		],
	});

const uploadFileToCDN = (filepath) => {
	return new Promise((resolve) => {
		const options = {
			method: "POST",
			url:
				"https://app.yellowmessenger.com/api/chat/upload?getUrlFromBlob=true",
			headers: {},
			formData: {
				images: {
					value: fs.createReadStream(filepath),
					options: {
						filename: filepath,
						contentType: null,
					},
				},
			},
		};
		request(options, function (error, response) {
			// console.log(error, filepath);
			if (error) {
				resolve({ status: false });
			}
			if (response) {
				resolve({ status: true, data: response.body });
			} else {
				resolve({ status: false });
			}
		});
	});
};

(async () => {
	try {
		const allFilesInHomePath = getAllFiles(HOME_PATH);
		for (const [folderName, files] of Object.entries(allFilesInHomePath)) {
			const fullPath = path.join(DirName, folderName) + ".csv";
			let previous_uploads = readUploadedFiles(fullPath);
			let outPutArray = [];
			// console.log(previous_uploads, "previous_uploads");
			for (let file of files) {
				let fileName = path.basename(file);
				// console.log(folderName, "/", fileName, "file");
				// console.log(file, "file");
				// continue;
				if (
					previous_uploads[fileName] &&
					previous_uploads[fileName].status == "success"
				) {
					outPutArray.push({
						file: fileName,
						status: "success",
						cdn_link: previous_uploads[fileName].cdn_link,
					});
					console.log(`${fileName} - uploaded`);
					continue;
				}
				let data = await uploadFileToCDN(file).catch(() => {
					return {};
				});
				// console.log(data);
				if (data["status"]) {
					let url = "";
					try {
						url = JSON.parse(data["data"])["url"];
					} catch (e) {
						/** */
					}
					outPutArray.push({
						file: fileName,
						status: url ? "success" : "failure",
						cdn_link: url,
					});
					console.log(`${fileName} - uploaded`);
				} else {
					outPutArray.push({
						file: fileName,
						status: "failure",
						cdn_link: "",
					});
					console.log(`${fileName} - not uploaded`);
				}
				if (_.get(outPutArray, "length")) {
					csvWriter(fullPath)
						.writeRecords(outPutArray)
						.then(() =>
							console.log(
								path.basename(fullPath),
								"The CSV file was written successfully"
							)
						)
						.catch(() => {
							console.log(
								path.basename(fullPath),
								"unable to save the CSV file"
							);
						});
				}
			}
		}
	} catch (e) {
		console.log(e, "error");
	} finally {
		// csvWriter(OUT_PATH)
		//   .writeRecords(outPutArray)
		//   .then(() => console.log("The CSV file was written successfully"));
	}
})();
