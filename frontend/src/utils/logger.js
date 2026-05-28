/**
 * Logger utility that is a no-op in production.
 */
export const logger = {
  log: (...args) => {
    if (!import.meta.env.PROD) {
      console.log(...args);
    }
  },
  error: (...args) => {
    if (!import.meta.env.PROD) {
      console.error(...args);
    }
  },
  warn: (...args) => {
    if (!import.meta.env.PROD) {
      console.warn(...args);
    }
  },
  info: (...args) => {
    if (!import.meta.env.PROD) {
      console.info(...args);
    }
  },
};
