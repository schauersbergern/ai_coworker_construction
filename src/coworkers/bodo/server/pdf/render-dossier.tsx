import { renderToBuffer } from "@react-pdf/renderer";
import { DossierDocument, type DossierProps } from "./dossier-document";

export async function renderDossier(props: DossierProps): Promise<Buffer> {
  return renderToBuffer(<DossierDocument {...props} />);
}
