import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Play,
  Image as ImageIcon,
  Youtube,
  Search,
  Plus,
  Sparkles,
  ChevronRight,
  Monitor,
  Trash2,
  Loader2,
  Tag,
} from "lucide-react";
import { toast } from "sonner";

interface EducationVideo {
  id: string;
  title: string;
  description: string | null;
  youtube_url: string | null;
  thumbnail_url: string | null;
  type: string;
  is_custom: boolean;
  treatment_keywords: string[];
  subcategory_id: string;
}

interface EducationSubcategory {
  id: string;
  name: string;
  name_ta: string | null;
  category_id: string;
  videos: EducationVideo[];
}

interface EducationCategory {
  id: string;
  name: string;
  name_ta: string | null;
  icon: string | null;
  color: string | null;
  subcategories: EducationSubcategory[];
}

const PatientEducation = () => {
  const [categories, setCategories] = useState<EducationCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [playingVideo, setPlayingVideo] = useState<EducationVideo | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newVideo, setNewVideo] = useState({ title: "", description: "", youtubeUrl: "", type: "video" as "video" | "image", keywords: "" });

  const activeCategory = categories.find((c) => c.id === selectedCategory);
  const activeSubcategory = activeCategory?.subcategories.find((s) => s.id === selectedSubcategory);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [catRes, subRes, vidRes] = await Promise.all([
      supabase.from("education_categories").select("*").order("sort_order"),
      supabase.from("education_subcategories").select("*").order("sort_order"),
      supabase.from("education_videos").select("*").order("sort_order"),
    ]);

    const cats = (catRes.data || []) as any[];
    const subs = (subRes.data || []) as any[];
    const vids = (vidRes.data || []) as any[];

    const built: EducationCategory[] = cats.map((cat) => ({
      ...cat,
      subcategories: subs
        .filter((s) => s.category_id === cat.id)
        .map((sub) => ({
          ...sub,
          videos: vids.filter((v) => v.subcategory_id === sub.id),
        })),
    }));

    setCategories(built);
    setLoading(false);
  };

  const filteredCategories = categories.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.name_ta || "").includes(searchQuery) ||
      c.subcategories.some(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (s.name_ta || "").includes(searchQuery)
      )
  );

  const handleAddVideo = async () => {
    if (!newVideo.title || !selectedSubcategory) {
      toast.error("Please fill in required fields");
      return;
    }

    let embedUrl = newVideo.youtubeUrl;
    if (embedUrl.includes("youtube.com/watch?v=")) {
      const videoId = embedUrl.split("v=")[1]?.split("&")[0];
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
    } else if (embedUrl.includes("youtu.be/")) {
      const videoId = embedUrl.split("youtu.be/")[1]?.split("?")[0];
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
    }

    const keywords = newVideo.keywords
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    const insertData: any = {
      subcategory_id: selectedSubcategory,
      title: newVideo.title,
      description: newVideo.description || null,
      type: newVideo.type,
      is_custom: true,
      treatment_keywords: keywords,
    };

    if (newVideo.type === "video") {
      insertData.youtube_url = embedUrl;
    } else {
      insertData.thumbnail_url = embedUrl;
    }

    const { error } = await supabase.from("education_videos").insert(insertData);
    if (error) {
      toast.error("Failed to add: " + error.message);
      return;
    }

    setNewVideo({ title: "", description: "", youtubeUrl: "", type: "video", keywords: "" });
    setShowAddDialog(false);
    toast.success("Video/Photo added successfully!");
    fetchAll();
  };

  const handleDeleteVideo = async (videoId: string) => {
    const { error } = await supabase.from("education_videos").delete().eq("id", videoId);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("Removed successfully");
    if (playingVideo?.id === videoId) setPlayingVideo(null);
    fetchAll();
  };

  const totalVideos = categories.reduce(
    (sum, c) => sum + c.subcategories.reduce((s, sub) => s + sub.videos.length, 0),
    0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Monitor className="h-7 w-7 text-primary" />
            Patient Education Videos
          </h1>
          <p className="text-muted-foreground mt-1">
            Treatment-wise educational videos & photos for patient counselling
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-sm px-3 py-1">
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            {categories.length} Categories • {totalVideos} Videos
          </Badge>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search treatments... (e.g. Crown, RCT, Braces)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Category List */}
        <div className="lg:col-span-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Treatment Categories
          </h3>
          {filteredCategories.map((category) => (
            <Card
              key={category.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedCategory === category.id
                  ? "ring-2 ring-primary shadow-md"
                  : "hover:ring-1 hover:ring-border"
              }`}
              onClick={() => {
                setSelectedCategory(category.id);
                setSelectedSubcategory(category.subcategories[0]?.id || null);
                setPlayingVideo(null);
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{category.icon}</span>
                    <div>
                      <p className="font-semibold text-foreground">{category.name}</p>
                      <p className="text-xs text-muted-foreground">{category.name_ta}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {category.subcategories.reduce((s, sub) => s + sub.videos.length, 0)} videos
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                {selectedCategory === category.id && (
                  <div className="mt-3 pt-3 border-t space-y-1">
                    {category.subcategories.map((sub) => (
                      <button
                        key={sub.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSubcategory(sub.id);
                          setPlayingVideo(null);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedSubcategory === sub.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <span className="font-medium">{sub.name}</span>
                        <span className="text-xs opacity-75 ml-2">({sub.videos.length})</span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Right: Videos & Content */}
        <div className="lg:col-span-8">
          {!selectedCategory ? (
            <Card className="h-full flex items-center justify-center min-h-[400px]">
              <CardContent className="text-center py-16">
                <Monitor className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Select a Treatment Category
                </h3>
                <p className="text-muted-foreground max-w-sm mx-auto">
                  Choose a treatment from the left panel to view educational videos and photos for patient counselling.
                </p>
              </CardContent>
            </Card>
          ) : activeSubcategory ? (
            <div className="space-y-4">
              {/* Sub header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    {activeCategory?.icon} {activeSubcategory.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">{activeSubcategory.name_ta}</p>
                </div>
                <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-1" />
                      Add YouTube / Photo
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Video or Photo</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <Tabs
                        value={newVideo.type}
                        onValueChange={(v) =>
                          setNewVideo({ ...newVideo, type: v as "video" | "image" })
                        }
                      >
                        <TabsList className="w-full">
                          <TabsTrigger value="video" className="flex-1">
                            <Youtube className="h-4 w-4 mr-1" /> YouTube Video
                          </TabsTrigger>
                          <TabsTrigger value="image" className="flex-1">
                            <ImageIcon className="h-4 w-4 mr-1" /> Photo URL
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                      <div>
                        <Label>Title *</Label>
                        <Input
                          value={newVideo.title}
                          onChange={(e) => setNewVideo({ ...newVideo, title: e.target.value })}
                          placeholder="e.g. Zirconia Crown Procedure"
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Textarea
                          value={newVideo.description}
                          onChange={(e) => setNewVideo({ ...newVideo, description: e.target.value })}
                          placeholder="Brief description for the patient..."
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label>
                          {newVideo.type === "video" ? "YouTube URL" : "Image URL"} *
                        </Label>
                        <Input
                          value={newVideo.youtubeUrl}
                          onChange={(e) => setNewVideo({ ...newVideo, youtubeUrl: e.target.value })}
                          placeholder={
                            newVideo.type === "video"
                              ? "https://www.youtube.com/watch?v=..."
                              : "https://example.com/image.jpg"
                          }
                        />
                      </div>
                      <div>
                        <Label className="flex items-center gap-1">
                          <Tag className="h-3.5 w-3.5" /> Treatment Keywords
                        </Label>
                        <Input
                          value={newVideo.keywords}
                          onChange={(e) => setNewVideo({ ...newVideo, keywords: e.target.value })}
                          placeholder="e.g. crown, zirconia crown, ceramic (comma separated)"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          These keywords auto-link this video in Treatment Plan. Separate with commas.
                        </p>
                      </div>
                      <Button onClick={handleAddVideo} className="w-full">
                        <Plus className="h-4 w-4 mr-1" /> Add to {activeSubcategory.name}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Playing video */}
              {playingVideo && playingVideo.type === "video" && playingVideo.youtube_url && (
                <Card className="overflow-hidden">
                  <div className="aspect-video">
                    <iframe
                      src={playingVideo.youtube_url + "?autoplay=1"}
                      title={playingVideo.title}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-foreground">{playingVideo.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{playingVideo.description}</p>
                    {playingVideo.treatment_keywords?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {playingVideo.treatment_keywords.map((k, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{k}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {playingVideo && playingVideo.type === "image" && playingVideo.thumbnail_url && (
                <Card className="overflow-hidden">
                  <img
                    src={playingVideo.thumbnail_url}
                    alt={playingVideo.title}
                    className="w-full max-h-[500px] object-cover"
                  />
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-foreground">{playingVideo.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{playingVideo.description}</p>
                  </CardContent>
                </Card>
              )}

              {/* Video/Photo grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeSubcategory.videos.map((video) => (
                  <Card
                    key={video.id}
                    className={`cursor-pointer transition-all hover:shadow-md group ${
                      playingVideo?.id === video.id ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => setPlayingVideo(video)}
                  >
                    <CardContent className="p-0">
                      <div className="relative aspect-video bg-muted overflow-hidden rounded-t-lg">
                        {video.type === "video" ? (
                          <>
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                              <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                <Play className="h-6 w-6 text-primary-foreground ml-1" />
                              </div>
                            </div>
                            {video.youtube_url && (
                              <img
                                src={`https://img.youtube.com/vi/${video.youtube_url.split("/embed/")[1]?.split("?")[0]}/mqdefault.jpg`}
                                alt={video.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            )}
                          </>
                        ) : (
                          <img
                            src={video.thumbnail_url || ""}
                            alt={video.title}
                            className="w-full h-full object-cover"
                          />
                        )}
                        <Badge
                          className="absolute top-2 left-2"
                          variant={video.type === "video" ? "default" : "secondary"}
                        >
                          {video.type === "video" ? (
                            <><Youtube className="h-3 w-3 mr-1" /> Video</>
                          ) : (
                            <><ImageIcon className="h-3 w-3 mr-1" /> Photo</>
                          )}
                        </Badge>
                        {video.is_custom && (
                          <Badge className="absolute top-2 right-2 bg-green-600">Custom</Badge>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-medium text-foreground text-sm truncate">
                              {video.title}
                            </h4>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {video.description}
                            </p>
                          </div>
                          {video.is_custom && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteVideo(video.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {activeSubcategory.videos.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Play className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      No videos yet. Click "Add YouTube / Photo" to add educational content.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PatientEducation;
