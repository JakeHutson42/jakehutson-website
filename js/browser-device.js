$(function () {
    let reportData = {};
    let copyNotificationTimer = null;

    initialisePage();

    async function initialisePage() {
        collectBrowserInformation();
        collectDeviceInformation();
        collectDisplayInformation();
        collectLocaleInformation();
        collectConnectionInformation();
        collectGraphicsInformation();
        collectCapabilities();

        await collectClientHints();
        await collectStorageInformation();
        await collectBatteryInformation();

        updateSummary();
        buildReportData();
        initialiseEvents();
    }

    function collectBrowserInformation() {
        const browser = detectBrowser();

        setValue("browserName", browser.name);
        setValue("browserVersion", browser.version);
        setValue("browserEngine", browser.engine);
        setValue("browserVendor", navigator.vendor || "Not reported");
        setValue("browserPlatform", navigator.platform || "Not reported");
        setBooleanValue("pdfViewerEnabled", navigator.pdfViewerEnabled);
        setValue("primaryLanguage", navigator.language || "Not reported");
        setValue("browserLanguages", navigator.languages && navigator.languages.length ? navigator.languages.join(", ") : "Not reported");
        setBooleanValue("cookiesEnabled", navigator.cookieEnabled);
        setValue("doNotTrack", getDoNotTrackValue());
        setOnlineStatus();
        setBooleanValue("javaEnabled", typeof navigator.javaEnabled === "function" ? navigator.javaEnabled() : false);
        setValue("userAgent", navigator.userAgent || "Not reported");
    }

    function collectDeviceInformation() {
        setValue("deviceType", detectDeviceType());
        setValue("operatingSystem", detectOperatingSystem());
        setValue("logicalProcessors", navigator.hardwareConcurrency ? navigator.hardwareConcurrency.toString() : "Not reported");
        setValue("deviceMemory", navigator.deviceMemory ? navigator.deviceMemory + " GB (approx.)" : "Not reported by this browser");
        setValue("touchPoints", typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints.toString() : "Not reported");

        setValue("architecture", "Not reported by this browser", "unavailable");
        setValue("bitness", "Not reported by this browser", "unavailable");
        setValue("deviceModel", "Not reported by this browser", "unavailable");
    }

    function collectDisplayInformation() {
        updateDisplayInformation();

        setValue("devicePixelRatio", window.devicePixelRatio ? window.devicePixelRatio.toFixed(2) + "×" : "Not reported");
        setValue("colourDepth", screen.colorDepth ? screen.colorDepth + "-bit" : "Not reported");
        setValue("pixelDepth", screen.pixelDepth ? screen.pixelDepth + "-bit" : "Not reported");
        setValue("colourGamut", detectColourGamut());
        setBooleanValue("hdrDisplay", window.matchMedia && window.matchMedia("(dynamic-range: high)").matches);
    }

    function collectLocaleInformation() {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const offsetMinutes = new Date().getTimezoneOffset();
        const offsetSign = offsetMinutes <= 0 ? "+" : "-";
        const absoluteOffset = Math.abs(offsetMinutes);
        const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
        const offsetRemainingMinutes = String(absoluteOffset % 60).padStart(2, "0");
        const resolvedOptions = Intl.DateTimeFormat().resolvedOptions();

        setValue("timezone", timezone || "Not reported");
        setValue("utcOffset", "UTC" + offsetSign + offsetHours + ":" + offsetRemainingMinutes);
        setValue("localTime", new Date().toLocaleString());
        setValue("hourCycle", resolvedOptions.hourCycle || "Browser default");

        window.setInterval(function () {
            setValue("localTime", new Date().toLocaleString());
        }, 1000);
    }

    function collectConnectionInformation() {
        const connection = getNetworkConnection();

        setValue("connectionStatus", navigator.onLine ? "Online" : "Offline", navigator.onLine ? "supported" : "warning");

        if (!connection) {
            setValue("connectionType", "Not reported by this browser", "unavailable");
            setValue("effectiveConnectionType", "Not reported by this browser", "unavailable");
            setValue("connectionDownlink", "Not reported by this browser", "unavailable");
            setValue("connectionRtt", "Not reported by this browser", "unavailable");
            setValue("saveData", "Not reported by this browser", "unavailable");
            return;
        }

        setValue("connectionType", connection.type || "Not reported");
        setValue("effectiveConnectionType", connection.effectiveType ? connection.effectiveType.toUpperCase() : "Not reported");
        setValue("connectionDownlink", typeof connection.downlink === "number" ? connection.downlink + " Mbps" : "Not reported");
        setValue("connectionRtt", typeof connection.rtt === "number" ? connection.rtt + " ms" : "Not reported");
        setBooleanValue("saveData", connection.saveData);
    }

    function collectGraphicsInformation() {
        const graphics = getGraphicsInformation();

        setValue("webglVersion", graphics.version);
        setValue("gpuVendor", graphics.vendor);
        setValue("gpuRenderer", graphics.renderer);
    }

    async function collectClientHints() {
        if (!navigator.userAgentData || typeof navigator.userAgentData.getHighEntropyValues !== "function") {
            return;
        }

        try {
            const values = await navigator.userAgentData.getHighEntropyValues(["architecture", "bitness", "model", "platform", "platformVersion", "fullVersionList"]);

            if (values.architecture) {
                setValue("architecture", values.architecture);
            }

            if (values.bitness) {
                setValue("bitness", values.bitness + "-bit");
            }

            if (values.model) {
                setValue("deviceModel", values.model);
            }

            if (values.platform) {
                const platformVersion = values.platformVersion ? " " + values.platformVersion : "";
                setValue("operatingSystem", values.platform + platformVersion);
            }

            const browser = detectBrowserFromClientHints(values.fullVersionList);

            if (browser) {
                setValue("browserName", browser.name);
                setValue("browserVersion", browser.version);
            }
        } catch (error) {
            console.debug("High entropy client hints were unavailable.", error);
        }
    }

    async function collectStorageInformation() {
        if (!navigator.storage || typeof navigator.storage.estimate !== "function") {
            setStorageUnavailable();
            return;
        }

        try {
            const estimate = await navigator.storage.estimate();
            const usage = estimate.usage || 0;
            const quota = estimate.quota || 0;
            const percentage = quota > 0 ? (usage / quota) * 100 : 0;

            setValue("storageUsed", formatBytes(usage));
            setValue("storageQuota", formatBytes(quota));
            setValue("storagePercentage", percentage.toFixed(2) + "%");

            if (typeof navigator.storage.persisted === "function") {
                const persistent = await navigator.storage.persisted();
                setBooleanValue("persistentStorage", persistent);
            } else {
                setValue("persistentStorage", "Not reported by this browser", "unavailable");
            }
        } catch (error) {
            setStorageUnavailable();
            console.debug("Browser storage information was unavailable.", error);
        }
    }

    async function collectBatteryInformation() {
        if (typeof navigator.getBattery !== "function") {
            setBatteryUnavailable();
            return;
        }

        try {
            const battery = await navigator.getBattery();

            updateBatteryInformation(battery);
            battery.addEventListener("levelchange", function () { updateBatteryInformation(battery); });
            battery.addEventListener("chargingchange", function () { updateBatteryInformation(battery); });
            battery.addEventListener("chargingtimechange", function () { updateBatteryInformation(battery); });
            battery.addEventListener("dischargingtimechange", function () { updateBatteryInformation(battery); });
        } catch (error) {
            setBatteryUnavailable();
            console.debug("Battery information was unavailable.", error);
        }
    }

    function collectCapabilities() {
        setCapability("capLocalStorage", supportsStorage("localStorage"));
        setCapability("capIndexedDb", "indexedDB" in window);
        setCapability("capServiceWorker", "serviceWorker" in navigator);
        setCapability("capWebAssembly", typeof WebAssembly === "object");
        setCapability("capWebGl2", supportsWebGl2());
        setCapability("capWebGpu", "gpu" in navigator);
        setCapability("capGeolocation", "geolocation" in navigator);
        setCapability("capClipboard", !!navigator.clipboard);
        setCapability("capNotifications", "Notification" in window);
        setCapability("capMediaDevices", !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
        setCapability("capWebRtc", "RTCPeerConnection" in window);
        setCapability("capFullscreen", document.fullscreenEnabled === true);
        setCapability("capPictureInPicture", "pictureInPictureEnabled" in document);
        setCapability("capShare", typeof navigator.share === "function");
        setCapability("capVibration", typeof navigator.vibrate === "function");
        setCapability("capBluetooth", "bluetooth" in navigator);
        setCapability("capUsb", "usb" in navigator);
        setCapability("capSerial", "serial" in navigator);
        setCapability("capFileSystem", "showOpenFilePicker" in window);
        setPreferenceCapability("capDarkMode", window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches, "Dark preferred", "Light preferred");
        setPreferenceCapability("capReducedMotion", window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches, "Reduced motion", "Standard motion");
    }

    function initialiseEvents() {
        $(window).on("resize", function () {
            updateDisplayInformation();
            updateSummary();
        });

        $(window).on("online offline", function () {
            setOnlineStatus();
            collectConnectionInformation();
            updateSummary();
        });

        const connection = getNetworkConnection();

        if (connection && typeof connection.addEventListener === "function") {
            connection.addEventListener("change", function () {
                collectConnectionInformation();
                updateSummary();
            });
        }

        if (screen.orientation && typeof screen.orientation.addEventListener === "function") {
            screen.orientation.addEventListener("change", updateDisplayInformation);
        }

        $("#copyReportButton").on("click", copyReportToClipboard);
        $("#downloadReportButton").on("click", downloadReport);

        $("#mobileNavigation a[href^='#']").on("click", function () {
            const navigation = document.getElementById("mobileNavigation");

            if (navigation && window.bootstrap) {
                bootstrap.Collapse.getOrCreateInstance(navigation).hide();
            }
        });
    }

    function detectBrowser() {
        const userAgent = navigator.userAgent;
        const edgeMatch = userAgent.match(/EdgA?\/([\d.]+)/) || userAgent.match(/EdgiOS\/([\d.]+)/);

        if (edgeMatch) {
            return { name: "Microsoft Edge", version: edgeMatch[1], engine: "Blink" };
        }

        const operaMatch = userAgent.match(/OPR\/([\d.]+)/) || userAgent.match(/Opera\/([\d.]+)/);

        if (operaMatch) {
            return { name: "Opera", version: operaMatch[1], engine: "Blink" };
        }

        const firefoxMatch = userAgent.match(/Firefox\/([\d.]+)/) || userAgent.match(/FxiOS\/([\d.]+)/);

        if (firefoxMatch) {
            return { name: "Mozilla Firefox", version: firefoxMatch[1], engine: userAgent.includes("FxiOS") ? "WebKit" : "Gecko" };
        }

        const chromeMatch = userAgent.match(/Chrome\/([\d.]+)/) || userAgent.match(/CriOS\/([\d.]+)/);

        if (chromeMatch) {
            return { name: "Google Chrome", version: chromeMatch[1], engine: userAgent.includes("CriOS") ? "WebKit" : "Blink" };
        }

        const safariMatch = userAgent.match(/Version\/([\d.]+).*Safari/);

        if (safariMatch) {
            return { name: "Safari", version: safariMatch[1], engine: "WebKit" };
        }

        return { name: "Unknown browser", version: "Not identified", engine: detectBrowserEngine() };
    }

    function detectBrowserFromClientHints(fullVersionList) {
        if (!fullVersionList || !fullVersionList.length) {
            return null;
        }

        const preferredBrands = [
            { match: "Microsoft Edge", name: "Microsoft Edge" },
            { match: "Google Chrome", name: "Google Chrome" },
            { match: "Chromium", name: "Chromium" }
        ];

        for (let i = 0; i < preferredBrands.length; i++) {
            const brand = fullVersionList.find(function (item) { return item.brand === preferredBrands[i].match; });

            if (brand) {
                return { name: preferredBrands[i].name, version: brand.version };
            }
        }

        return null;
    }

    function detectBrowserEngine() {
        const userAgent = navigator.userAgent;

        if (/AppleWebKit/i.test(userAgent) && /Chrome|Chromium|Edg|OPR/i.test(userAgent)) {
            return "Blink";
        }

        if (/AppleWebKit/i.test(userAgent)) {
            return "WebKit";
        }

        if (/Gecko\//i.test(userAgent)) {
            return "Gecko";
        }

        return "Not identified";
    }

    function detectOperatingSystem() {
        const userAgent = navigator.userAgent;
        const platform = navigator.platform || "";

        if (/iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
            return "iOS / iPadOS";
        }

        if (/Android/.test(userAgent)) {
            const match = userAgent.match(/Android\s([0-9.]+)/);
            return match ? "Android " + match[1] : "Android";
        }

        if (/Windows NT 10.0/.test(userAgent)) {
            return "Windows 10 / 11";
        }

        if (/Windows NT 6.3/.test(userAgent)) {
            return "Windows 8.1";
        }

        if (/Windows NT 6.1/.test(userAgent)) {
            return "Windows 7";
        }

        if (/Mac OS X/.test(userAgent)) {
            const match = userAgent.match(/Mac OS X\s([0-9_]+)/);
            return match ? "macOS " + match[1].replace(/_/g, ".") : "macOS";
        }

        if (/CrOS/.test(userAgent)) {
            return "ChromeOS";
        }

        if (/Linux/.test(userAgent)) {
            return "Linux";
        }

        return platform || "Not identified";
    }

    function detectDeviceType() {
        const userAgent = navigator.userAgent;

        if (/iPad|Tablet|PlayBook|Silk/i.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
            return "Tablet";
        }

        if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(userAgent)) {
            return "Mobile";
        }

        return "Desktop / laptop";
    }

    function detectColourGamut() {
        if (!window.matchMedia) {
            return "Not reported";
        }

        if (window.matchMedia("(color-gamut: rec2020)").matches) {
            return "Rec. 2020";
        }

        if (window.matchMedia("(color-gamut: p3)").matches) {
            return "Display P3";
        }

        if (window.matchMedia("(color-gamut: srgb)").matches) {
            return "sRGB";
        }

        return "Not reported";
    }

    function updateDisplayInformation() {
        const orientation = screen.orientation && screen.orientation.type ? formatOrientation(screen.orientation.type) : window.innerWidth > window.innerHeight ? "Landscape" : "Portrait";

        setValue("screenResolution", screen.width + " × " + screen.height + " CSS px");
        setValue("availableScreen", screen.availWidth + " × " + screen.availHeight + " CSS px");
        setValue("viewportSize", window.innerWidth + " × " + window.innerHeight + " CSS px");
        setValue("screenOrientation", orientation);
    }

    function formatOrientation(orientation) {
        return orientation.replace("-", " ").replace(/\b\w/g, function (character) { return character.toUpperCase(); });
    }

    function getNetworkConnection() {
        return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    }

    function getGraphicsInformation() {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

        if (!gl) {
            return { version: "Unavailable", vendor: "Unavailable", renderer: "Unavailable" };
        }

        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        const isWebGl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;

        return {
            version: isWebGl2 ? "WebGL 2" : "WebGL 1",
            vendor: vendor || "Not reported",
            renderer: renderer || "Not reported"
        };
    }

    function supportsWebGl2() {
        try {
            const canvas = document.createElement("canvas");
            return !!canvas.getContext("webgl2");
        } catch (error) {
            return false;
        }
    }

    function supportsStorage(storageName) {
        try {
            const storage = window[storageName];
            const testKey = "__browser_device_test__";

            storage.setItem(testKey, testKey);
            storage.removeItem(testKey);

            return true;
        } catch (error) {
            return false;
        }
    }

    function getDoNotTrackValue() {
        const doNotTrack = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;

        if (doNotTrack === "1" || doNotTrack === "yes") {
            return "Enabled";
        }

        if (doNotTrack === "0" || doNotTrack === "no") {
            return "Disabled";
        }

        return "Not specified";
    }

    function setOnlineStatus() {
        setValue("onlineStatus", navigator.onLine ? "Online" : "Offline", navigator.onLine ? "supported" : "warning");
    }

    function updateBatteryInformation(battery) {
        setValue("batteryLevel", Math.round(battery.level * 100) + "%");
        setBooleanValue("batteryCharging", battery.charging);
        setValue("batteryChargingTime", formatBatteryTime(battery.chargingTime));
        setValue("batteryDischargingTime", formatBatteryTime(battery.dischargingTime));
    }

    function setBatteryUnavailable() {
        setValue("batteryLevel", "Not reported by this browser", "unavailable");
        setValue("batteryCharging", "Not reported by this browser", "unavailable");
        setValue("batteryChargingTime", "Not reported by this browser", "unavailable");
        setValue("batteryDischargingTime", "Not reported by this browser", "unavailable");
    }

    function setStorageUnavailable() {
        setValue("storageUsed", "Not reported by this browser", "unavailable");
        setValue("storageQuota", "Not reported by this browser", "unavailable");
        setValue("storagePercentage", "Not reported by this browser", "unavailable");
        setValue("persistentStorage", "Not reported by this browser", "unavailable");
    }

    function formatBatteryTime(seconds) {
        if (!Number.isFinite(seconds)) {
            return "Not currently available";
        }

        if (seconds === 0) {
            return "0 minutes";
        }

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        return hours > 0 ? hours + "h " + minutes + "m" : minutes + "m";
    }

    function formatBytes(bytes) {
        if (!bytes) {
            return "0 B";
        }

        const units = ["B", "KB", "MB", "GB", "TB"];
        const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / Math.pow(1024, unitIndex);

        return value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 2) + " " + units[unitIndex];
    }

    function setValue(id, value, state) {
        const $element = $("#" + id);

        $element.text(value);
        $element.removeClass("value-supported value-unavailable value-warning");

        if (state === "supported") {
            $element.addClass("value-supported");
        } else if (state === "unavailable") {
            $element.addClass("value-unavailable");
        } else if (state === "warning") {
            $element.addClass("value-warning");
        }
    }

    function setBooleanValue(id, value) {
        if (typeof value !== "boolean") {
            setValue(id, "Not reported by this browser", "unavailable");
            return;
        }

        setValue(id, value ? "Yes" : "No", value ? "supported" : null);
    }

    function setCapability(id, supported) {
        const $element = $("#" + id);

        $element.text(supported ? "Supported" : "Not supported");
        $element.toggleClass("supported", supported);
        $element.toggleClass("unavailable", !supported);
    }

    function setPreferenceCapability(id, enabled, enabledText, disabledText) {
        const $element = $("#" + id);

        $element.text(enabled ? enabledText : disabledText);
        $element.addClass("supported");
    }

    function updateSummary() {
        $("#summaryBrowser").text($("#browserName").text());
        $("#summaryDevice").text($("#deviceType").text());
        $("#summaryDisplay").text(screen.width + " × " + screen.height);

        const connection = getNetworkConnection();

        if (!navigator.onLine) {
            $("#summaryConnection").text("Offline");
        } else if (connection && connection.effectiveType) {
            $("#summaryConnection").text(connection.effectiveType.toUpperCase());
        } else {
            $("#summaryConnection").text("Online");
        }
    }

    function buildReportData() {
        reportData = {
            generatedAt: new Date().toISOString(),
            browser: {
                name: getText("browserName"),
                version: getText("browserVersion"),
                engine: getText("browserEngine"),
                vendor: getText("browserVendor"),
                platform: getText("browserPlatform"),
                userAgent: getText("userAgent"),
                language: getText("primaryLanguage"),
                languages: getText("browserLanguages"),
                cookiesEnabled: getText("cookiesEnabled"),
                doNotTrack: getText("doNotTrack"),
                online: getText("onlineStatus")
            },
            device: {
                type: getText("deviceType"),
                operatingSystem: getText("operatingSystem"),
                architecture: getText("architecture"),
                bitness: getText("bitness"),
                model: getText("deviceModel"),
                logicalProcessors: getText("logicalProcessors"),
                estimatedMemory: getText("deviceMemory"),
                touchPoints: getText("touchPoints")
            },
            display: {
                screenResolution: getText("screenResolution"),
                availableScreen: getText("availableScreen"),
                viewport: getText("viewportSize"),
                devicePixelRatio: getText("devicePixelRatio"),
                colourDepth: getText("colourDepth"),
                pixelDepth: getText("pixelDepth"),
                orientation: getText("screenOrientation"),
                colourGamut: getText("colourGamut"),
                hdr: getText("hdrDisplay")
            },
            graphics: {
                webgl: getText("webglVersion"),
                vendor: getText("gpuVendor"),
                renderer: getText("gpuRenderer")
            },
            connection: {
                status: getText("connectionStatus"),
                type: getText("connectionType"),
                effectiveType: getText("effectiveConnectionType"),
                downlink: getText("connectionDownlink"),
                rtt: getText("connectionRtt"),
                saveData: getText("saveData")
            },
            locale: {
                timezone: getText("timezone"),
                utcOffset: getText("utcOffset"),
                localTime: getText("localTime")
            },
            storage: {
                used: getText("storageUsed"),
                quota: getText("storageQuota"),
                percentage: getText("storagePercentage"),
                persistent: getText("persistentStorage")
            }
        };
    }

    async function copyReportToClipboard() {
        buildReportData();
        const reportText = createReadableReport();

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(reportText);
            } else {
                copyTextFallback(reportText);
            }

            showCopyNotification();
        } catch (error) {
            copyTextFallback(reportText);
            showCopyNotification();
        }
    }

    function createReadableReport() {
        return [
            "Browser & Device Report",
            "Generated: " + new Date().toLocaleString(),
            "",
            "BROWSER",
            "Browser: " + getText("browserName") + " " + getText("browserVersion"),
            "Engine: " + getText("browserEngine"),
            "Platform: " + getText("browserPlatform"),
            "User agent: " + getText("userAgent"),
            "Language: " + getText("primaryLanguage"),
            "",
            "DEVICE",
            "Type: " + getText("deviceType"),
            "Operating system: " + getText("operatingSystem"),
            "Architecture: " + getText("architecture"),
            "Bitness: " + getText("bitness"),
            "Model: " + getText("deviceModel"),
            "Logical processors: " + getText("logicalProcessors"),
            "Estimated memory: " + getText("deviceMemory"),
            "Touch points: " + getText("touchPoints"),
            "",
            "DISPLAY",
            "Resolution: " + getText("screenResolution"),
            "Available screen: " + getText("availableScreen"),
            "Viewport: " + getText("viewportSize"),
            "Device pixel ratio: " + getText("devicePixelRatio"),
            "Colour depth: " + getText("colourDepth"),
            "Orientation: " + getText("screenOrientation"),
            "Colour gamut: " + getText("colourGamut"),
            "",
            "GRAPHICS",
            "WebGL: " + getText("webglVersion"),
            "GPU vendor: " + getText("gpuVendor"),
            "GPU renderer: " + getText("gpuRenderer"),
            "",
            "CONNECTION",
            "Status: " + getText("connectionStatus"),
            "Type: " + getText("connectionType"),
            "Effective type: " + getText("effectiveConnectionType"),
            "Downlink: " + getText("connectionDownlink"),
            "RTT: " + getText("connectionRtt"),
            "",
            "LOCALE",
            "Timezone: " + getText("timezone"),
            "UTC offset: " + getText("utcOffset"),
            "Local time: " + getText("localTime")
        ].join("\n");
    }

    function copyTextFallback(text) {
        const $textarea = $("<textarea>");

        $textarea.val(text);
        $textarea.attr("readonly", "");
        $textarea.css({ position: "fixed", opacity: 0 });

        $("body").append($textarea);
        $textarea[0].select();
        document.execCommand("copy");
        $textarea.remove();
    }

    function showCopyNotification() {
        const $notification = $("#copyNotification");

        window.clearTimeout(copyNotificationTimer);
        $notification.addClass("visible");

        copyNotificationTimer = window.setTimeout(function () {
            $notification.removeClass("visible");
        }, 2500);
    }

    function downloadReport() {
        buildReportData();

        const json = JSON.stringify(reportData, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "browser-device-report-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";

        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function getText(id) {
        return $("#" + id).text().trim();
    }
});
