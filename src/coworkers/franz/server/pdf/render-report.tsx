import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument, type RenderInput } from "./report-document";

/** Rendert das Report-PDF deterministisch zu einem Buffer. */
export function renderReportPdf(input: RenderInput): Promise<Buffer> {
  return renderToBuffer(<ReportDocument {...input} />);
}
