class htmlParser {
	constructor() {
		this.preg = /<\s*un-([\w-]+)\s*([^>]+)?>([^<]+)?<\/\s*un-\1\s*>|<\s*un-([\w-]+)\s*([^>]+)?\/>/g;
		this.handlers = new Map();
		this.handlersSync = new Map();
	}
	parseArgs(args) {
		let results = {};
		if(Array.isArray(args)) {
			return results;
		}
		let regexp = /([\w-_]+)=?(['"]+([^'"]+)['"]+)?/g;
		let result;
		while (result = regexp.exec(args)) {
			if(result[1]) {
				let val = (result[3]) ? result[3] : '';
				if(val == 'false') {
					val = false;
				}
				if(val == 'true') {
					val = true;
				}
				results[result[1]] = val;
			}
		}
		return results;
	}
	async isPromise(prom) {
		if('object' == typeof(prom) && prom.then) {
			return await prom;
		} else {
			return prom;
		}
	}
	async parse(content, custom_args={}) {
		content = await this.isPromise(content);
		return new Promise((resolve, rej) => {
            if(content.search(this.preg) == -1) {
                resolve(content);
            }
			replace(this.preg, content, (callback, match, name, args=[], content="", name2, args2)=>{
				name = (name2) ? name2 : name;
				args = ('string' == typeof(args2)) ? args2 : args;
				args = this.parseArgs(args);
				if('function' == typeof(this.get(name))) {
					 this.get(name)(args, custom_args, content).then(res =>{
						 res = (res == null || !res) ? '' : res;
						 callback(null, res);
					 }).catch(e => {
					 	console.log(e);
					 });
				} else {
					 callback(null, match);
				}
			},(err, result) => {
				resolve(result);
			});
		});
	}
	parseSync(content, custom_args={}) {
        if(content.search(this.preg) == -1) {
        	return content;
        }

        content.replace(this.preg, (match, name, args=[], content="", name2, args2) => {
			name = (name2) ? name2 : name;
			args = ('string' == typeof(args2)) ? args2 : args;
			args = this.parseArgs(args);
			if('function' == typeof(this.getSync(name))) {
				return this.getSync(name)(args, custom_args, content);
			} else {
				return match;
			}
        });
	}
	findTagSync(content, tag) {
		if(content.search(this.preg) == -1) {
        	return;
        }
		let result, next=true;
		while (result = this.preg.exec(content)) {
			if(result[1] == tag) {
				return tag;
			}
		}
	}
	add(name, callback) {
		if(callback.constructor.name === "AsyncFunction") {
			this.handlers.set(name, callback);
		} else {
			this.handlersSync.set(name, callback);
		}
	}
	get(name) {
		if(this.handlers.has(name)) {
		   return this.handlers.get(name);
		}
	}
	getSync(name) {
		if(this.handlersSync.has(name)) {
		   return this.handlersSync.get(name);
		}
	}
}
function replace(regex, str, replacer, done) {
	regex.lastIndex = 0;
	var match = regex.exec(str);
	if(match==null) { // No matches, we are done.
		done(null, str);
	}
	else {
		// Found a match, call the async replacer
		var params = Array.of(function(err, result) {
			if(err) { // If the replacer failed, callback and pass the error
				return done(err, result);
			}
			var matchIndex = match.index;
			var matchLength = match[0].length;
			// Splice the replacement back into the string
			var accum = str.substring(0,matchIndex) + result;
			var rest = str.substring(matchIndex + matchLength);
			if(regex.global) { // Keep replacing
				replace(regex, rest, replacer, function(err, remaining) {
						done(err, accum + remaining);
					});
			}
			else {
				done(null, accum + rest);
			}
		});
		replacer.apply(null, params.concat(match));
	}
}

module.exports = htmlParser;