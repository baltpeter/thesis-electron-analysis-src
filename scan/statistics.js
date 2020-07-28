/*
We want to collect the following data points for each application:

- [x] Electron version -> string
- [x] What websites are loaded?
    * List of all URLs -> string[]
    * How many times was win.loadFile() called? -> int
    * How many times was win.loadURL() called? -> int
- [x] How many protocol handlers are registered? -> int
- [x] How many times is XSS risked? (combine UserProvidedHtmlJSCheck and DangerousFunctionsJSCheck) -> int
- [x] How many times is user-provided code executed? (on the host, not in JS) -> int
- [x] How many times is shell.openExternal() called with non-constant value? -> int
- [x] CSPs
    * CSP defined? -> bool
    * List of all defined CSPs -> string[]
    * Count of 'strong' CSPs -> int
    * Count of 'maybe weak' CSPs -> int
    * Count of 'weak' CSPs -> int

- [x] DevTools
    * How many times implicitly enabled? -> int
    * How many times explicitly enabled? -> int
    * How many times explicitly disabled? -> int
- [x] Context isolation
    * How many times implicitly disabled? -> int
    * How many times explicitly enabled? -> int
    * How many times explicitly disabled? -> int
- [x] Node integration (combine NodeIntegrationHTMLCheck and NodeIntegrationJSCheck)
    * How many times implicitly enabled? -> int
    * How many times implicitly disabled? -> int
    * How many times explicitly enabled? -> int
    * How many times explicitly disabled? -> int
- [x] Remote module
    * How many times implicitly enabled? -> int
    * How many times implicitly disabled? -> int
    * How many times explicitly enabled? -> int
    * How many times explicitly disabled? -> int
- [x] Sandbox
    * How many times implicitly disabled? -> int
    * How many times explicitly enabled? -> int
    * How many times explicitly disabled? -> int
- [x] Web security (combine WebSecurityHTMLCheck and WebSecurityJSCheck)
    * How many times implicitly enabled? -> int
    * How many times explicitly enabled? -> int
    * How many times explicitly disabled? -> int
*/
const statisticsFromElectronegativityResult = (res) => {
    const countOfCheck = (check_id) => res.issues.filter((i) => i.id === check_id).length;

    const collect = (check_id, count_props = [], array_props = []) => {
        const items = res.issues.filter((i) => i.id === check_id);
        const stats = {};

        for (const count_prop of count_props) {
            const prop = count_prop[0];
            const prefix = count_prop[2] === undefined ? prop + '_' : count_prop[2];
            for (const value of count_prop[1]) {
                stats[`${prefix}${value}_count`] = 0;
            }

            for (const item of items) {
                stats[`${prefix}${item.properties[prop]}_count`]++;
            }
        }

        for (const prop of array_props) {
            const idx = `${prop}_list`;
            stats[idx] = [];

            for (const item of items) {
                const value = item.properties[prop];
                if (value) stats[idx].push(value);
            }
        }

        return stats;
    };
    const collectType = (check_id) => {
        return collect(check_id, [
            ['type', ['implicitly_enabled', 'implicitly_disabled', 'explicitly_enabled', 'explicitly_disabled'], ''],
        ]);
    };

    const addObjectCounts = (a, b) => {
        const res = JSON.parse(JSON.stringify(a));
        for (const key in b) {
            if (b.hasOwnProperty(key)) {
                if (res[key]) res[key] += b[key];
                else res[key] = b[key];
            }
        }
        return res;
    };

    const csp_item = res.issues.find((i) => i.id === 'CSP_GLOBAL_CHECK');
    return {
        electron_version: res.electronVersion,
        loaded_sites: collect(
            'LOADED_WEBSITES_JS_CHECK',
            [['method', ['loadURL', 'loadFile', 'protocol', 'unknown']]],
            ['target']
        ),
        protocol_handlers: countOfCheck('PROTOCOL_HANDLER_JS_CHECK'),
        dangerous_code: countOfCheck('USER_PROVIDED_HTML_JS_CHECK') + countOfCheck('DANGEROUS_FUNCTIONS_JS_CHECK'),
        dangerous_execution: countOfCheck('USER_PROVIDED_CODE_EXECUTION_JS_CHECK'),
        open_external: countOfCheck('OPEN_EXTERNAL_JS_CHECK'),
        csp: (csp_item && csp_item.properties) || {
            csp_list: [],
            no_csp_found: true,
            num_weak_csps: 0,
            num_strong_csps: 0,
            num_maybe_weak_csps: 0,
            num_invalid_csps: 0,
        },

        dev_tools: collectType('DEV_TOOLS_JS_CHECK'),
        context_isolation: collectType('CONTEXT_ISOLATION_JS_CHECK'),
        node_integration: addObjectCounts(
            collectType('NODE_INTEGRATION_JS_CHECK'),
            collectType('NODE_INTEGRATION_HTML_CHECK')
        ),
        remote_module: collectType('REMOTE_MODULE_JS_CHECK'),
        sandbox: collectType('SANDBOX_JS_CHECK'),
        web_security: addObjectCounts(collectType('WEB_SECURITY_JS_CHECK'), collectType('WEB_SECURITY_HTML_CHECK')),
    };
};

module.exports = { statisticsFromElectronegativityResult };
