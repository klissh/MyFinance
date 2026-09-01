-- ====================================================================
-- SUPABASE COMPLETE DATABASE SCHEMA & RLS POLICIES FOR MYFINANCE APP
-- ====================================================================
-- Documented & Production-Ready Script
-- Covers: Profiles, Accounts, Transactions, Goals, Scheduled Payments,
-- Shared Kos Rooms, Split Bills, Room Requirements, Triggers & RLS Policies.
-- ====================================================================

-- 0. ENABLE UUID EXTENSION
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- 1. USER PROFILES TABLE (Linked with Supabase Auth)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger to automatically create a profile when a new user signs up in Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.email,
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ====================================================================
-- 2. ACCOUNTS / SUMBER DANA (Bank BCA, Mandiri, Cash, GoPay)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,              -- e.g. "Bank BCA", "Tunai / Cash"
    type TEXT NOT NULL DEFAULT 'utama', -- 'utama', 'tabungan', 'dompet', 'digital'
    balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    color TEXT DEFAULT 'primary',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ====================================================================
-- 3. CATEGORIES (Pemasukan, Konsumsi, Kamar Kos, Utilitas)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL for global default categories
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('in', 'out')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ====================================================================
-- 4. PERSONAL TRANSACTIONS / ARUS KAS PRIBADI
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('in', 'out')),
    amount NUMERIC(15, 2) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ====================================================================
-- 5. SAVING GOALS / NABUNG & TARGET IMPIAN
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,             -- e.g. "Beli Laptop M3"
    category TEXT NOT NULL,          -- e.g. "Gadget & Work"
    target_amount NUMERIC(15, 2) NOT NULL,
    current_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    deadline TEXT,                   -- e.g. "Okt 2026"
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'almost', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ====================================================================
-- 6. SAVING LOGS (History Setoran Tabungan)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.saving_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    amount NUMERIC(15, 2) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    auto_logged_to_transactions BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ====================================================================
-- 7. SCHEDULED PAYMENTS & REMINDERS (Jadwal Tagihan & Kalender)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.scheduled_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,             -- e.g. "Sewa Kamar Kos", "Netflix"
    category TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    due_date DATE NOT NULL,
    recurring_period TEXT DEFAULT 'monthly', -- 'once', 'weekly', 'monthly', 'yearly'
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ====================================================================
-- 8. KAMAR KOS / SHARED ROOMS
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,              -- e.g. "Kamar Kos Anugerah #102"
    invite_code TEXT UNIQUE NOT NULL, -- e.g. "KOS-BDG-102"
    location TEXT,
    monthly_fee NUMERIC(15, 2) DEFAULT 0.00,
    max_members INT DEFAULT 4,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ====================================================================
-- 9. ROOM MEMBERS (Penghuni Kamar Kos)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.room_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'Anggota' CHECK (role IN ('Ketua Kos', 'Anggota')),
    user_name TEXT,
    room_number TEXT DEFAULT 'Kamar 01',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(room_id, user_id)
);


-- ====================================================================
-- 10. ROOM SHARED TRANSACTIONS & SPLIT BILLS (Transaksi Talangan Kos)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.room_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    paid_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,             -- e.g. "Makan Malam Nasi Goreng Bersama"
    category TEXT NOT NULL DEFAULT 'Konsumsi Kos',
    total_amount NUMERIC(15, 2) NOT NULL,
    per_person_amount NUMERIC(15, 2) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ====================================================================
-- 11. ROOM TRANSACTION DEBTORS (Rincian Utang Per Anggota)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.room_transaction_splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES public.room_transactions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount_owed NUMERIC(15, 2) NOT NULL,
    is_settled BOOLEAN DEFAULT FALSE,
    settled_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(transaction_id, user_id)
);


-- ====================================================================
-- 12. ROOM ROUTINE REQUIREMENTS (Kebutuhan Bulanan Bersama Kos)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.room_requirements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    title TEXT NOT NULL,             -- e.g. "Tagihan Wifi Indihome 100Mbps"
    category TEXT NOT NULL DEFAULT 'Utilitas Kos',
    total_price NUMERIC(15, 2) NOT NULL,
    split_people_count INT NOT NULL DEFAULT 4,
    per_person_price NUMERIC(15, 2) NOT NULL,
    due_date DATE NOT NULL,
    responsible_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ====================================================================
-- 13. ROOM REQUIREMENT PAYMENTS (Pembayaran & Auto-Log Ke Transaksi)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.room_requirement_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requirement_id UUID NOT NULL REFERENCES public.room_requirements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    personal_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    paid_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(requirement_id, user_id)
);


-- ====================================================================
-- 14. AUTOMATIC UPDATED_AT TRIGGER FUNCTION
-- ====================================================================
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_update_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
CREATE TRIGGER tr_update_accounts BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
CREATE TRIGGER tr_update_transactions BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
CREATE TRIGGER tr_update_goals BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
CREATE TRIGGER tr_update_scheduled BEFORE UPDATE ON public.scheduled_payments FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
CREATE TRIGGER tr_update_rooms BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
CREATE TRIGGER tr_update_room_tx BEFORE UPDATE ON public.room_transactions FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
CREATE TRIGGER tr_update_room_req BEFORE UPDATE ON public.room_requirements FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


-- ====================================================================
-- 15. ROW LEVEL SECURITY (RLS) POLICIES (OPTIMIZED FOR ROOM CREATION & SEARCH)
-- ====================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saving_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_requirement_payments ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by authenticated users" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Accounts Policies
CREATE POLICY "Users can view their own accounts" ON public.accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own accounts" ON public.accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own accounts" ON public.accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own accounts" ON public.accounts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Categories Policies
CREATE POLICY "Users can view global or own categories" ON public.categories FOR SELECT TO authenticated USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Users can insert own categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Personal Transactions Policies
CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions" ON public.transactions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions" ON public.transactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Goals Policies
CREATE POLICY "Users can view own goals" ON public.goals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own goals" ON public.goals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own goals" ON public.goals FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own goals" ON public.goals FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Saving Logs Policies
CREATE POLICY "Users can view saving logs of own goals" ON public.saving_logs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.goals WHERE goals.id = saving_logs.goal_id AND goals.user_id = auth.uid()));
CREATE POLICY "Users can insert saving logs for own goals" ON public.saving_logs FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.goals WHERE goals.id = saving_logs.goal_id AND goals.user_id = auth.uid()));

-- Scheduled Payments Policies
CREATE POLICY "Users can view own scheduled payments" ON public.scheduled_payments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own scheduled payments" ON public.scheduled_payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own scheduled payments" ON public.scheduled_payments FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own scheduled payments" ON public.scheduled_payments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Rooms & Room Members Policies
CREATE POLICY "Authenticated users can view rooms" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create rooms" ON public.rooms FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners can delete rooms" ON public.rooms FOR DELETE TO authenticated USING (created_by = auth.uid());

CREATE POLICY "Authenticated users can view room members" ON public.room_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can join rooms" ON public.room_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave rooms" ON public.room_members FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Room Transactions & Splits Policies
CREATE POLICY "Room members can view room transactions" ON public.room_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Room members can insert room transactions" ON public.room_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Room members can view transaction splits" ON public.room_transaction_splits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Room members can update their own debt split" ON public.room_transaction_splits FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Room Requirements & Payments Policies
CREATE POLICY "Room members can view requirements" ON public.room_requirements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Room members can insert requirements" ON public.room_requirements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Room members can view requirement payments" ON public.room_requirement_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can record their requirement payment" ON public.room_requirement_payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ====================================================================
-- END OF SCHEMA
-- ====================================================================
