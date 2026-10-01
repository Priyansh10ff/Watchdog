// An error that carries an HTTP status code.
// Used where code has no `res` to reply with (services, jobs): they throw this,
// and the controller that called them catches it and replies with error.statusCode.
//
//   throw new ApiError(404, "Monitor not found");
//   ...
//   catch (error) { return res.status(error.statusCode || 500).json({ ... }); }

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message); // sets .message and the stack trace via the built-in Error
    this.statusCode = statusCode;
  }
}

export default ApiError;

// VIVA
// Q: What does super(message) do?  Calls the parent Error constructor.
// Q: 401 vs 403?                   401 = not logged in, 403 = logged in but not allowed.
