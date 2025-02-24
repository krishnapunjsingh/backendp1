import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"


const registerUser = asyncHandler( async (req,res)=>{
    // get user details by frontend 
    // validation - not enmpty
    // check if user already exist : username, email
    // check for imazes , check for avatar
    // upload them to cloudinary, avatar
    // create user object - creata entry in db 
    // remove password and refersh token field from response 
    // check for user creation
    //return response 


    //extract all data points from body
    const {fullName, email,username, password} =req.body
    // console.log("email", email,password, fullName, username)

    if(
        [fullName, email, username, password].some((field)=>
        field?.trim()==="")
    ){
        throw new ApiError(400, "All fields are required");
    }

    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    })

    if(existedUser){
        throw new ApiError(409, "User with eamil or username already exist")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImazeLocalPath = req.files?.coverImaze[0]?.path;


    let coverImazeLocalPath;
    if(req.files && Array.isArray(req.files.coverImaze) && req.files.coverImaze.length > 0){
        coverImazeLocalPath = req.files.coverImaze[0].path
    }


    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar field is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImaze = await uploadOnCloudinary(coverImazeLocalPath)

    if(!avatar){
        throw new ApiError(400, "Avatar field is required")
    }

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImaze: coverImaze?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering user");

    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User Registerd Successfully")
    )



})

const generateAccessAndRefreshTokens = async(userId)=>{
    try{
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})


        return {accessToken, refreshToken}

    }catch{
        throw new ApiError(500, "Something went wrong while generating refresh and access token ")
    }
}

const loginUser = asyncHandler( async (req,res)=>{
    //req body -> data
    //email/username
    //find the user
    //password check
    //access and refresh token dono generate kar user ko bhejenge
    //send cookies

    const {email, username, password} = req.body
    
    if(!(username || email)){
        throw new ApiError(400, "username or email is required")
    }
    
    //find email or username
    const user = await User.findOne({
        $or: [{username}, {email}]
    })

    if(!user){
        throw new ApiError(404, "User does not exist")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid user credential" )
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken " , accessToken, options)
    .cookie("refreshToken ", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User logged In Successfully "
        )
    )

})

const logoutUser = asyncHandler(async(req, res) => {
   await User.findByIdAndUpdate(
    req.user._id,
    {
        $set: {
            refreshToken: undefined
        }
    },{
        new: true
    }
   )

   const options = {
    httpOnly: true,
    secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(
        new ApiResponse(200, {} , "User logged out")
    )
})

const refreshAccessToken = asyncHandler(async (req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(401 , "unauthorizes request ")
    }

    try {
        const decodedTOken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedTOken?._id)
    
        if(!user){
            throw new ApiError(401 , "Invalid refresh token ")
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401 , "Refresh token is expired or used")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
    
        const {accessToken , newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken , options)
        .cookie("refreshToken", newRefreshToken , options)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken: newRefreshToken },
                "Access token refreshed "
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }

})


const changeCurrentPassword = asyncHandler( async(req,res)=>{
    const {oldPassword , newPassword} = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiError(400 , "Invalid old password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(new ApiResponse(200, {} , "Password changed successfully"))



})

const getCurrentUser = asyncHandler(async(req,res)=>{
    return res
    .status(200)
    .json(new ApiResponse(200, req.user, "current user fetched successfully"))
})

const updateAccountDetails = asyncHandler( async(res,res)=>{
    const {fullName,email} = req.body

    if(!fullName || !email){
        throw new ApiError(400, "All fields Are required")
    }


    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email: email
            }
        }, 
        {new: true}
    )
    .select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, "Account detail updated successfully"))



})

const updateUserAvatar = asyncHandler ( async(req , res)=>{
    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar.url){
        throw new ApiError(400, "Error while uploading on avatar")

    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        {new: true}
    ).select(" -password")

    return res
    .status(200)
    .json(
        ApiResponse(200 , "Avatar updated successfully ")
    )

    
})

const updateUserCoverImage = asyncHandler( async(req,res)=>{
    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath){
        throw new ApiError(400, "Cover image file is missing ")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!coverImage.url){
        throw new ApiError(400, "Error while uploading cover image")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select(" -password")

    return res
    .status(200)
    .json(
        ApiResponse(200 , "Cover image updated successfully ")
    )
})

export { 
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage
 }