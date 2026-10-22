type Level = 'info' | 'error';

function write(level: Level, message: string, context: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...context });
  (level === 'error' ? console.error : console.log)(line);
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
};
