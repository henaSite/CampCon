-- 005_core_lost_found_schema.sql
-- Core tables and RLS policies for Campus Connect (CampCon)

-- 1. Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Categories are viewable by everyone" ON public.categories;
CREATE POLICY "Categories are viewable by everyone"
  ON public.categories FOR SELECT
  USING (true);

INSERT INTO public.categories (name) VALUES
  ('Phones'),
  ('Laptops'),
  ('Bags'),
  ('Wallets'),
  ('Identification cards'),
  ('Books and documents'),
  ('Keys'),
  ('Clothing'),
  ('Accessories'),
  ('Other')
ON CONFLICT (name) DO NOTHING;

-- 2. Lost Items Table
CREATE TABLE IF NOT EXISTS public.lost_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  item_name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  location TEXT NOT NULL,
  date_lost DATE NOT NULL,
  image_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'recovered')),
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.lost_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved or own lost items are viewable" ON public.lost_items;
CREATE POLICY "Approved or own lost items are viewable"
  ON public.lost_items FOR SELECT
  USING (
    status = 'approved'
    OR status = 'recovered'
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "Authenticated users can insert lost items" ON public.lost_items;
CREATE POLICY "Authenticated users can insert lost items"
  ON public.lost_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners and admins can update lost items" ON public.lost_items;
CREATE POLICY "Owners and admins can update lost items"
  ON public.lost_items FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "Owners and admins can delete lost items" ON public.lost_items;
CREATE POLICY "Owners and admins can delete lost items"
  ON public.lost_items FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'moderator')
    )
  );

-- 3. Found Items Table
CREATE TABLE IF NOT EXISTS public.found_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  item_name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  location TEXT NOT NULL,
  date_found DATE NOT NULL,
  image_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'recovered')),
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.found_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved or own found items are viewable" ON public.found_items;
CREATE POLICY "Approved or own found items are viewable"
  ON public.found_items FOR SELECT
  USING (
    status = 'approved'
    OR status = 'recovered'
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "Authenticated users can insert found items" ON public.found_items;
CREATE POLICY "Authenticated users can insert found items"
  ON public.found_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners and admins can update found items" ON public.found_items;
CREATE POLICY "Owners and admins can update found items"
  ON public.found_items FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "Owners and admins can delete found items" ON public.found_items;
CREATE POLICY "Owners and admins can delete found items"
  ON public.found_items FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'moderator')
    )
  );

-- 4. Comments Table
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('lost', 'found')),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.comments;
CREATE POLICY "Comments are viewable by everyone"
  ON public.comments FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can add comments" ON public.comments;
CREATE POLICY "Authenticated users can add comments"
  ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners and admins can delete comments" ON public.comments;
CREATE POLICY "Owners and admins can delete comments"
  ON public.comments FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'moderator')
    )
  );

-- 5. Private Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  item_id UUID,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
CREATE POLICY "Users can view their own messages"
  ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Receivers can mark messages as read" ON public.messages;
CREATE POLICY "Receivers can mark messages as read"
  ON public.messages FOR UPDATE
  USING (auth.uid() = receiver_id);

-- 6. Blocked Users Table
CREATE TABLE IF NOT EXISTS public.blocked_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  blocked_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (blocker_id, blocked_id)
);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own blocked list" ON public.blocked_users;
CREATE POLICY "Users can view their own blocked list"
  ON public.blocked_users FOR SELECT
  USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can block other users" ON public.blocked_users;
CREATE POLICY "Users can block other users"
  ON public.blocked_users FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can unblock users" ON public.blocked_users;
CREATE POLICY "Users can unblock users"
  ON public.blocked_users FOR DELETE
  USING (auth.uid() = blocker_id);