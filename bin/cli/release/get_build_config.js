const _ = require('underscore');
const path = require('path');
module.exports = function(plugin, build_name, includeBuildConfig) {
	let build = plugin.builder.config;
	let releaseConfigs = build.release.configs;
	let releaseBuilds = build.release.build;
	let config = Object.assign({}, releaseConfigs.default);
	if(!releaseBuilds[build_name]) {
		build_name = 'default';
	}
	let hasBuildName = !!(releaseBuilds[build_name]);
	if (hasBuildName) {
	  config = _.extend(config, (releaseBuilds.default || {}), releaseBuilds[build_name]);

	  let configId = releaseBuilds[build_name].configId;
	  if (!releaseConfigs[configId]) {
	    this.logger.warning(`${configId} config is not specified in release configs for ${plugin.id} plugin. Default configuration will be used.`, 'CLI');
	  } else {
	    config = _.extend(config, releaseConfigs[configId], releaseBuilds[build_name]);
	  }
	} else {
		this.logger.warning(`${build_name} release is not specified for ${plugin.id} plugin. Default configuration will be used.`, 'CLI');
	}
	
	let buildConfig = this.app.config.build.releases.default;
	if(includeBuildConfig) {
		if(this.app.config.build.releases[build_name]) {
			buildConfig = _.extend({}, buildConfig, this.app.config.build.releases[build_name]);
		}
		config = _.extend(config, buildConfig);
	}
	config.outputReleaseDir = path.join(this.app.project.dist, (buildConfig.outputPathRelativeDist || './releases/'));
	return config;
}