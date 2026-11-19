/** A refusal with the status an API caller gets and a sentence a person reads. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "That item") =>
  new AppError(404, `${what} wasn't found.`);
