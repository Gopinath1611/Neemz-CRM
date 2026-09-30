import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SessionRow {
  id: string;
  userName: string;
  role: string;
  lastSeen: string;
  status: "online" | "offline";
  sessions: number;
  totalTime: string;
}

export interface SessionsTableProps {
  sessions: SessionRow[];
}

const SessionsTable = ({ sessions }: SessionsTableProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Logged-In Users & Sessions</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sessions</TableHead>
              <TableHead>Total Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No sessions found.
                </TableCell>
              </TableRow>
            )}
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.userName}</TableCell>
                <TableCell>{s.role}</TableCell>
                <TableCell>{s.lastSeen}</TableCell>
                <TableCell>
                  <Badge variant={s.status === "online" ? "default" : "secondary"}>
                    {s.status}
                  </Badge>
                </TableCell>
                <TableCell>{s.sessions}</TableCell>
                <TableCell>{s.totalTime}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default SessionsTable;
