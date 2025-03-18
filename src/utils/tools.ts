/**
 * 格式化日期时间
 * @param date 日期时间
 * @param formatString 格式化字符串
 * @returns 格式化后的日期时间字符串
 * @example
 * ```ts
 * const date = new Date();
 * const formattedDateTime = formatDateTime(date, 'YYYYMMDDHHmmss');
 * console.log(formattedDateTime); // 20210908120000
 * ```
 */
export function formatDateTime(date: Date, formatString?: string): string {
    const d = date;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

