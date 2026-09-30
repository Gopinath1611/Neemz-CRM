import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface PageTimeStat {
  id: string;
  pageOrModule: string;
  visits: number;
  totalTime: string;
  avgTime: string;
  mostActiveUsers: string[];
}

export interface PageTimeTableProps {
  pageStats: PageTimeStat[];
}

const PageTimeTable = ({ pageStats }: PageTimeTableProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Page Time Spent</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Page / Module</TableHead>
              <TableHead>Visits</TableHead>
              <TableHead>Total Time</TableHead>
              <TableHead>Avg Time</TableHead>
              <TableHead>Most Active Users</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageStats.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No page data found.
                </TableCell>
              </TableRow>
            )}
            {pageStats.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.pageOrModule}</TableCell>
                <TableCell>{p.visits}</TableCell>
                <TableCell>{p.totalTime}</TableCell>
                <TableCell>{p.avgTime}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.mostActiveUsers.join(", ")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default PageTimeTable;
