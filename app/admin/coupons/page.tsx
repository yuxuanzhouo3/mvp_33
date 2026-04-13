"use client";

import { useEffect, useState } from "react";
import {
  createCoupon,
  deleteCoupon,
  getCouponCreationDefaults,
  getCouponSummary,
  listCoupons,
} from "@/actions/admin-coupons";
import type { CouponCreationDefaults } from "@/actions/admin-coupons";
import type { Coupon, CouponStatus, CreateCouponData, CouponSummary } from "@/lib/admin/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  Search,
  TicketPercent,
  Trash2,
  User,
} from "lucide-react";

const FALLBACK_COUPON_DEFAULTS: CouponCreationDefaults = {
  discount_ratio: 0.8,
  user_id: "",
  source_discount_type: "percentage",
  source_discount_value: 20,
};

const EMPTY_SUMMARY: CouponSummary = {
  totalIssued: 0,
  usedCount: 0,
  unusedCount: 0,
  expiredCount: 0,
  boundCount: 0,
  unboundCount: 0,
};

function createCouponDraft(defaults: CouponCreationDefaults): CreateCouponData {
  return {
    discount_ratio: defaults.discount_ratio,
    user_id: defaults.user_id,
    issued_to_user_id: defaults.user_id,
    expires_at: "",
  };
}

function toDateTimeLocalValue(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function resolveIssuedToUserId(coupon: Coupon) {
  return coupon.issued_to_user_id || coupon.user_id || "";
}

function resolveUsedByUserId(coupon: Coupon) {
  return coupon.used_by_user_id || (coupon.status === "used" ? resolveIssuedToUserId(coupon) : "");
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString();
}

function getStatusBadge(status: CouponStatus) {
  switch (status) {
    case "active":
      return <Badge className="bg-amber-500 hover:bg-amber-500">Unused</Badge>;
    case "used":
      return <Badge className="bg-green-600 hover:bg-green-600">Used</Badge>;
    case "expired":
      return <Badge variant="destructive">Expired</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function CouponsManagementPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [summary, setSummary] = useState<CouponSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [couponDefaults, setCouponDefaults] = useState<CouponCreationDefaults>(FALLBACK_COUPON_DEFAULTS);
  const [newCoupon, setNewCoupon] = useState<CreateCouponData>(() => createCouponDraft(FALLBACK_COUPON_DEFAULTS));
  const [isCreating, setIsCreating] = useState(false);
  const [isSyncingDefaults, setIsSyncingDefaults] = useState(false);

  async function loadCouponDefaults(applyToForm = false) {
    setIsSyncingDefaults(true);
    const result = await getCouponCreationDefaults();

    if (result.success && result.data) {
      setCouponDefaults(result.data);
      if (applyToForm) {
        setNewCoupon(createCouponDraft(result.data));
      }
    }

    setIsSyncingDefaults(false);
  }

  async function fetchCouponData(targetPage = page) {
    setLoading(true);

    const [listResult, summaryResult] = await Promise.all([
      listCoupons({
        limit: 20,
        offset: (targetPage - 1) * 20,
        search: searchQuery || undefined,
      }),
      getCouponSummary({
        search: searchQuery || undefined,
      }),
    ]);

    if (listResult.success && listResult.data) {
      setCoupons(listResult.data.items);
      setTotal(listResult.data.total);
      setError(null);
    } else {
      setError(listResult.error || "Failed to fetch coupons");
    }

    if (summaryResult.success && summaryResult.data) {
      setSummary(summaryResult.data);
    } else if (!listResult.success) {
      setSummary(EMPTY_SUMMARY);
    }

    setLoading(false);
  }

  useEffect(() => {
    void fetchCouponData(page);
  }, [page]);

  useEffect(() => {
    void loadCouponDefaults(true);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    await fetchCouponData(1);
  };

  const handleCreateCoupon = async () => {
    setIsCreating(true);

    const payload: CreateCouponData = {
      ...newCoupon,
      user_id: (newCoupon.issued_to_user_id || newCoupon.user_id || "").trim() || undefined,
      issued_to_user_id: (newCoupon.issued_to_user_id || newCoupon.user_id || "").trim() || undefined,
    };

    const result = await createCoupon(payload);
    if (result.success) {
      setIsCreateOpen(false);
      setNewCoupon(createCouponDraft(couponDefaults));
      await loadCouponDefaults();
      await fetchCouponData(1);
      setPage(1);
    } else {
      alert(result.error || "Failed to create coupon");
    }

    setIsCreating(false);
  };

  const handleCreateDialogChange = (open: boolean) => {
    setIsCreateOpen(open);

    if (open) {
      void loadCouponDefaults(true);
      return;
    }

    setNewCoupon(createCouponDraft(couponDefaults));
  };

  const handleDeleteCoupon = async (id: string) => {
    if (!confirm("Are you sure you want to delete this issued coupon record?")) return;
    const result = await deleteCoupon(id);
    if (result.success) {
      await fetchCouponData(page);
    } else {
      alert(result.error || "Failed to delete coupon");
    }
  };

  const summaryCards = [
    {
      title: "Total Issued",
      value: summary.totalIssued,
      hint: "All issued coupon records",
      icon: TicketPercent,
    },
    {
      title: "Used",
      value: summary.usedCount,
      hint: "Already redeemed by users",
      icon: CheckCircle2,
    },
    {
      title: "Unused",
      value: summary.unusedCount,
      hint: "Issued but not redeemed yet",
      icon: Clock3,
    },
    {
      title: "Bound Users",
      value: summary.boundCount,
      hint: "Issued to specific user IDs",
      icon: User,
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Coupons</h1>
          <p className="text-muted-foreground">
            Track issued coupons strictly by recipient, actual user, and redemption status.
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={handleCreateDialogChange}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Issue Coupon
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Issue New Coupon</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Default values are synced from marketing settings.
                {couponDefaults.user_id ? ` Default recipient: ${couponDefaults.user_id}.` : " No default recipient."}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="discount">Discount Ratio (0.1 - 0.99)</Label>
                <Input
                  id="discount"
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="0.99"
                  value={newCoupon.discount_ratio}
                  onChange={(e) => {
                    const value = Number.parseFloat(e.target.value);
                    setNewCoupon((current) => ({
                      ...current,
                      discount_ratio: Number.isFinite(value) ? value : couponDefaults.discount_ratio,
                    }));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Marketing default:{" "}
                  {couponDefaults.source_discount_type === "percentage"
                    ? `${couponDefaults.source_discount_value}% OFF`
                    : `fixed ${couponDefaults.source_discount_value}`}
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="issuedToUser">Issued To User ID (Optional)</Label>
                <Input
                  id="issuedToUser"
                  placeholder="Specific user only"
                  value={newCoupon.issued_to_user_id || newCoupon.user_id || ""}
                  onChange={(e) =>
                    setNewCoupon((current) => ({
                      ...current,
                      user_id: e.target.value,
                      issued_to_user_id: e.target.value,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  If blank, this coupon remains unbound and can be redeemed once by any eligible user.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="expiresAt">Expires At (Optional)</Label>
                <Input
                  id="expiresAt"
                  type="datetime-local"
                  value={toDateTimeLocalValue(newCoupon.expires_at)}
                  onChange={(e) =>
                    setNewCoupon((current) => ({
                      ...current,
                      expires_at: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                    }))
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleCreateDialogChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateCoupon} disabled={isCreating || isSyncingDefaults}>
                {(isCreating || isSyncingDefaults) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Issue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground">{card.hint}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by coupon code..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button type="submit">Search</Button>
          </form>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Issued To</TableHead>
                    <TableHead>Used By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Issued At</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {coupons.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center">
                        No issued coupons found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    coupons.map((coupon) => {
                      const issuedToUserId = resolveIssuedToUserId(coupon);
                      const usedByUserId = resolveUsedByUserId(coupon);

                      return (
                        <TableRow key={coupon.id}>
                          <TableCell className="font-mono font-bold">{coupon.code}</TableCell>
                          <TableCell>{Math.round((1 - coupon.discount_ratio) * 100)}% OFF</TableCell>
                          <TableCell>
                            {issuedToUserId ? (
                              <div className="flex items-center gap-1 text-xs">
                                <User className="h-3 w-3" />
                                <span className="max-w-[140px] truncate">{issuedToUserId}</span>
                              </div>
                            ) : (
                              <span className="text-xs italic text-muted-foreground">Universal</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {usedByUserId ? (
                              <div className="flex items-center gap-1 text-xs">
                                <User className="h-3 w-3" />
                                <span className="max-w-[140px] truncate">{usedByUserId}</span>
                              </div>
                            ) : (
                              <span className="text-xs italic text-muted-foreground">Not used</span>
                            )}
                          </TableCell>
                          <TableCell>{getStatusBadge(coupon.status)}</TableCell>
                          <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                            {coupon.order_no || "-"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(coupon.created_at)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(coupon.expires_at)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteCoupon(coupon.id)}
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Issued {summary.totalIssued} coupons in total, current list {total}.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
