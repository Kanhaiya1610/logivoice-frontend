export function unwrapDocument(value) {
  const source = value?.document || value || {}
  return {
    ...source,
    id: source.id ?? source.document_id ?? source.documentId,
    filename: source.filename ?? source.file_name ?? source.name ?? 'Untitled document',
    status: String(source.status ?? source.processing_status ?? source.processingStatus ?? 'unknown').toLowerCase(),
    documentType: source.document_type ?? source.documentType ?? source.doc_type ?? source.classification ?? source.type,
    sourceFilename: source.source_filename ?? source.sourceFilename,
    recordIndex: source.record_index ?? source.recordIndex,
    recordCount: source.record_count ?? source.recordCount,
    createdAt: source.created_at ?? source.createdAt ?? source.uploaded_at ?? source.uploadedAt,
    updatedAt: source.updated_at ?? source.updatedAt,
    size: source.file_size ?? source.fileSize ?? source.size,
    extractedText: source.extracted_text ?? source.extractedText ?? source.full_text ?? source.text ?? '',
    metadata: source.metadata ?? source.extracted_data ?? source.entities ?? source.fields ?? {},
    error: source.error ?? source.processing_error ?? source.processingError,
  }
}
