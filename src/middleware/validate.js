const { z } = require("zod");

function validate(schema) {
  return (req, res, next) => {
    try {
      const validatedData = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });

      req.validated = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation failed",
          errors: error.errors.map((err) => ({
            path: err.path.join("."),
            message: err.message,
            code: err.code,
          })),
        });
      }

      return res.status(500).json({
        message: "Validation error occurred",
      });
    }
  };
}

const commonSchemas = {
  mongoId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ObjectId"),
  email: z.string().email("Invalid email format"),
  priority: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["todo", "in_progress", "done"]),
  role: z.enum(["viewer", "member", "manager", "admin"]),
};

module.exports = { validate, z, commonSchemas };
