'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Service watcher.
 */
class ServiceWatcher {
    constructor(serviceName, consul, options) {
        this.serviceName = serviceName;
        this.consul = consul;
        this.options = options || {};
    }

    /**
     * Start watch.
     *
     * @param serviceName
     * @param options
     */
    watch(serviceName, options) {
        options = options || this.options;
        if (!_lodash2.default.has(options, 'passing')) {
            options.passing = true;
        }
        options.service = serviceName || this.serviceName;

        this.watcher = this.consul.watch({ method: this.consul.health.service, options: options });

        this.watcher.on('change', (data, res) => {
            this.change(data, res);
        });

        this.watcher.on('error', err => {
            this.error(err);
        });
    }

    /**
     * Change callback.
     *
     * @param callback the parameter is (data, res).
     */
    change(callback) {
        if (callback && typeof callback === 'function') {
            this.watcher.on('change', callback);
        }
    }

    /**
     * Error callback.
     *
     * @param callback The callback parameter is (error).
     */
    error(callback) {
        if (callback && typeof callback === 'function') {
            this.watcher.on('error', callback);
        }
    }

    end() {
        this.watcher.end();
    }
}
exports.default = ServiceWatcher;
module.exports = exports['default'];