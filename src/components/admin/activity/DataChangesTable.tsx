import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye } from "lucide-react";

export type ChangeAction = "Create" | "Update" | "Delete";

export interface DataChangeRow {
  id: string;
  time: string;
  userName: string;
  action: ChangeAction;
  entity: string;
  recordId: string;
  module: string;
}

export interface DataChangesTableProps {
  changes: DataChangeRow[];
  onViewDiff?: (id: string) => void;
}

const actionVariant: Record<ChangeAction, "default" | "secondary" | "destructive"> = {
  Create: "default",
  Update: "secondary",
  Delete: "destructive",
};

const DataChangesTable = ({ changes, onViewDiff }: DataChangesTableProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Data Changes</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Record ID</TableHead>
              <TableHead>Module</TableHead>
              <TableHead className="text-right">Diff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changes.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No changes found.
                </TableCell>
              </TableRow>
            )}
            {changes.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.time}</TableCell>
                <TableCell className="font-medium">{c.userName}</TableCell>
                <TableCell>
                  <Badge variant={actionVariant[c.action]}>{c.action}</Badge>
                </TableCell>
                <TableCell>{c.entity}</TableCell>
                <TableCell className="font-mono text-xs">{c.recordId}</TableCell>
                <TableCell>{c.module}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewDiff?.(c.id)}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    View Diff
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default DataChangesTable;
