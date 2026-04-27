import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import { uploadImage } from './service';

export async function uploadHandler(req: Request, res: Response): Promise<void> {
  // multer puts the parsed file at req.file.
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    throw HttpError.badRequest('No file uploaded. Use multipart/form-data with a "file" field.');
  }

  const folderRaw = (req.query.folder ?? req.body?.folder) as string | undefined;

  const result = await uploadImage({
    buffer: file.buffer,
    mimeType: file.mimetype,
    size: file.size,
    folder: folderRaw,
    originalName: file.originalname,
  });

  res.status(201).json(result);
}
