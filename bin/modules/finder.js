let fs = require('fs');
let path = require('path');
module.exports = function(filename) {
	let paths =  process.cwd().split(path.sep);
	let finder = function() {
		let pathToFile = path.join(paths.join(path.sep), filename);
		return fs.existsSync(pathToFile) ? pathToFile : false
	}
	if(paths.length) {
		while (paths.length) {
			let ph = finder();
			if(ph) {
				return ph;
			}
			paths.pop();
		}
	}
}
