// Wraps an async Express handler so thrown errors / rejected promises reach
// the centralized error-handling middleware instead of crashing the process
// or requiring a try/catch in every controller.
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
