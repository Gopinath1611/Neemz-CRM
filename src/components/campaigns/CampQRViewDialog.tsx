import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QRCodeCanvas } from "qrcode.react";
import { Download, ExternalLink } from "lucide-react";

export interface CampQRCampaign {
  id: string;
  name: string;
  camp_code?: string | null;
}

interface Props {
  campaign: CampQRCampaign | null;
  onClose: () => void;
}

const CampQRViewDialog = ({ campaign, onClose }: Props) => {
  const qrRef = useRef<HTMLDivElement>(null);
  const baseUrl = window.location.origin;

  const downloadQr = (camp: CampQRCampaign) => {
    const canvas = qrRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${camp.camp_code || "camp"}-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const printQr = (camp: CampQRCampaign) => {
    const canvas = qrRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>${camp.camp_code}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:40px}h1{margin:0}img{margin:24px 0;width:320px;height:320px}p{color:#555}</style>
      </head><body>
      <h1>${camp.name}</h1>
      <p style="font-family:monospace;font-size:18px">${camp.camp_code}</p>
      <p>Scan to register for free dental screening</p>
      <img src="${dataUrl}" />
      <p style="font-size:12px">${baseUrl}/camp-register/${camp.id}</p>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <Dialog open={!!campaign} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{campaign?.name}</DialogTitle>
        </DialogHeader>
        {campaign && (
          <div className="space-y-4">
            <div ref={qrRef} className="flex justify-center bg-white p-4 rounded-lg border">
              <QRCodeCanvas value={`${baseUrl}/camp-register/${campaign.id}`} size={240} level="H" includeMargin />
            </div>
            <div className="text-center">
              <p className="font-mono text-sm">{campaign.camp_code}</p>
              <a href={`${baseUrl}/camp-register/${campaign.id}`} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                <ExternalLink className="h-3 w-3" /> Open registration page
              </a>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => downloadQr(campaign)}><Download className="h-3 w-3 mr-1" /> Download</Button>
              <Button onClick={() => printQr(campaign)}>Print</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CampQRViewDialog;
