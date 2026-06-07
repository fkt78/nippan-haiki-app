export const APP_VERSION = __APP_VERSION__;
export const BUILD_TIME = __BUILD_TIME__;

export const formatBuildTime = (isoString) => {
    return new Date(isoString).toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
};
